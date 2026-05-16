import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from '@supabase/supabase-js';
import { create as signJwt, getNumericDate } from 'djwt';

// --- Spotify OAuth callback (PKCE) -----------------------------------------
// Spotify redirects the host to this function with ?code=...&state=...
// We:
//   1. Look up the (state, code_verifier) row from oauth_states (single-use).
//   2. POST to Spotify /api/token to exchange code+verifier for tokens.
//   3. Fetch /v1/me to learn the host's Spotify identity.
//   4. Upsert into public.users.
//   5. Encrypt the refresh token with AES-256-GCM and upsert into public.spotify_tokens.
//   6. Sign a host JWT (HS256) matching the NestJS HostJwtService format.
//   7. 302 the browser to WEB_AUTH_COMPLETE_URL?token=...&user_id=... so the
//      web app can hand the JWT to NestJS for /status, /logout, etc.
//
// We MUST never log the Spotify access_token, refresh_token, authorization
// code, or the JWT. The Edge Function deploys with verify_jwt=false because
// Spotify itself calls this URL.

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_ME_URL = 'https://api.spotify.com/v1/me';

const HOST_TOKEN_AUDIENCE = 'fairplay:host';
const HOST_TOKEN_ISSUER = 'fairplay:api';
const HOST_TOKEN_TTL_SECONDS = 60 * 60 * 12;

const ENCRYPTION_IV_BYTES = 12;

interface SpotifyTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface SpotifyMeResponse {
  id: string;
  display_name: string | null;
  email: string | null;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const errorRedirect = (webUrl: string, code: string): Response => {
  const u = new URL(webUrl);
  u.searchParams.set('error', code);
  return Response.redirect(u.toString(), 302);
};

const base64UrlDecode = (input: string): Uint8Array => {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

const toBase64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const encryptRefreshToken = async (
  refreshToken: string,
  keyBytes: Uint8Array,
): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(refreshToken),
    ),
  );

  // Web Crypto returns ciphertext || authTag (16 bytes) — same wire format
  // as TokenEncryptionService in libs/shared-utils so NestJS can decrypt.
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return toBase64(combined);
};

const importHs256Key = async (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );

const signHostJwt = async (userId: string, secret: string): Promise<string> => {
  const key = await importHs256Key(secret);
  return signJwt(
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: userId,
      role: 'host',
      aud: HOST_TOKEN_AUDIENCE,
      iss: HOST_TOKEN_ISSUER,
      exp: getNumericDate(HOST_TOKEN_TTL_SECONDS),
    },
    key,
  );
};

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  const webCompleteUrl = Deno.env.get('WEB_AUTH_COMPLETE_URL');
  if (!webCompleteUrl) {
    console.error('WEB_AUTH_COMPLETE_URL is not configured');
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Server misconfiguration.' } }, 500);
  }

  if (errorParam) {
    console.warn(`Spotify returned OAuth error: ${errorParam}`);
    return errorRedirect(webCompleteUrl, errorParam);
  }
  if (!code || !state) {
    return errorRedirect(webCompleteUrl, 'missing_code_or_state');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const redirectUri = Deno.env.get('SPOTIFY_REDIRECT_URI');
  const tokenEncryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY');
  const hostJwtSecret = Deno.env.get('HOST_JWT_SECRET');

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !clientId ||
    !redirectUri ||
    !tokenEncryptionKey ||
    !hostJwtSecret
  ) {
    console.error('Edge Function is missing required environment variables.');
    return errorRedirect(webCompleteUrl, 'server_misconfigured');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1) Consume the OAuth state row (single-use).
  const { data: stateRow, error: stateErr } = await supabase
    .from('oauth_states')
    .select('state, code_verifier, redirect_to, expires_at')
    .eq('state', state)
    .maybeSingle();

  if (stateErr) {
    console.error(`Failed to read oauth_states: ${stateErr.message}`);
    return errorRedirect(webCompleteUrl, 'state_lookup_failed');
  }
  if (!stateRow) {
    return errorRedirect(webCompleteUrl, 'invalid_state');
  }
  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    await supabase.from('oauth_states').delete().eq('state', state);
    return errorRedirect(webCompleteUrl, 'state_expired');
  }

  // Delete the state row immediately so the verifier can't be reused.
  await supabase.from('oauth_states').delete().eq('state', state);

  // 2) Exchange code+verifier for tokens.
  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: stateRow.code_verifier,
  });

  const tokenResp = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  });

  if (!tokenResp.ok) {
    const status = tokenResp.status;
    console.error(`Spotify token exchange failed with HTTP ${status}.`);
    return errorRedirect(webCompleteUrl, `token_exchange_${status}`);
  }

  const tokens = (await tokenResp.json()) as SpotifyTokenResponse;
  if (!tokens.refresh_token || !tokens.access_token) {
    console.error('Spotify token response missing refresh_token or access_token.');
    return errorRedirect(webCompleteUrl, 'token_exchange_malformed');
  }

  // 3) Get the Spotify identity.
  const meResp = await fetch(SPOTIFY_ME_URL, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!meResp.ok) {
    console.error(`Spotify /v1/me failed with HTTP ${meResp.status}.`);
    return errorRedirect(webCompleteUrl, `me_fetch_${meResp.status}`);
  }
  const me = (await meResp.json()) as SpotifyMeResponse;

  // 4) Upsert into users.
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .upsert(
      {
        email: me.email,
        display_name: me.display_name,
        spotify_user_id: me.id,
      },
      { onConflict: 'spotify_user_id' },
    )
    .select('id')
    .single();

  if (userErr || !userRow) {
    console.error(`Failed to upsert user: ${userErr?.message ?? 'unknown error'}`);
    return errorRedirect(webCompleteUrl, 'user_upsert_failed');
  }
  const userId = userRow.id as string;

  // 5) Encrypt and store the refresh token.
  const encrypted = await encryptRefreshToken(
    tokens.refresh_token,
    base64UrlDecode(tokenEncryptionKey),
  );
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const scopes = tokens.scope ? tokens.scope.split(' ').filter(Boolean) : [];

  const { error: tokenErr } = await supabase.from('spotify_tokens').upsert(
    {
      user_id: userId,
      encrypted_refresh_token: encrypted,
      expires_at: expiresAt,
      scopes,
    },
    { onConflict: 'user_id' },
  );
  if (tokenErr) {
    console.error(`Failed to upsert spotify_tokens: ${tokenErr.message}`);
    return errorRedirect(webCompleteUrl, 'token_store_failed');
  }

  // 6) Issue a Host JWT.
  const hostJwt = await signHostJwt(userId, hostJwtSecret);

  // 7) Redirect to the web app. If the caller passed redirectTo in /login,
  // forward to that; otherwise WEB_AUTH_COMPLETE_URL.
  const target = new URL(stateRow.redirect_to ?? webCompleteUrl);
  target.searchParams.set('token', hostJwt);
  target.searchParams.set('user_id', userId);

  console.log(`Host ${userId} (${me.id}) connected Spotify with scopes=${scopes.join(',')}.`);
  return Response.redirect(target.toString(), 302);
});
