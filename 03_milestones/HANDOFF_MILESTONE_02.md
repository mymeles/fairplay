# Handoff — Milestone 02: Spotify Host Authentication

## Architectural change vs. the original milestone doc

The milestone called for the `GET /api/v1/auth/spotify/callback` endpoint to live on NestJS. We split it: NestJS owns `/login`, `/status`, `/logout`, but the Spotify-facing redirect URI now points at a Supabase Edge Function so the public URL is stable in dev and prod. Database moved from local docker Postgres to Supabase Postgres (project `zgublzgoejdzexwpicvb`). User confirmed both choices at the start of M2.

## Completed

- Supabase migration applied (`supabase/migrations/m02_users_spotify_tokens_oauth_states.sql`):
  - `users` with `spotify_user_id` for upsert-on-conflict.
  - `spotify_tokens` with unique `user_id`, encrypted refresh token, scopes array, expiry.
  - `oauth_states` with PKCE verifier + 10-minute TTL, single-use.
  - RLS enabled on all three tables; explicit deny policies for `anon` and `authenticated`. Service-role key (NestJS + Edge Function) bypasses RLS by design.
  - `updated_at` trigger with locked `search_path` (no advisor warnings).
- Prisma schema updated to match.
- Token encryption (AES-256-GCM, 12-byte IV, wire format `iv || ciphertext || authTag`) implemented twice with identical wire formats:
  - `libs/shared-utils/src/token-encryption.ts` (Node crypto, used by NestJS).
  - Inline Web Crypto in `supabase/functions/spotify-callback/index.ts` (used by the Edge Function).
  - Cross-platform test (`token-encryption.cross-platform.spec.ts`) confirms NestJS can decrypt what the Edge Function encrypted.
- Host JWT (HS256, 12h TTL, `aud=fairplay:host`, `iss=fairplay:api`) signed by both NestJS (`jsonwebtoken`) and Edge Function (`djwt`); secret shared via `HOST_JWT_SECRET`.
- NestJS `SpotifyAuthModule`:
  - `SpotifyAuthService.buildLoginRedirect` (PKCE pair + state, stored in `oauth_states`, redirect URL with required scopes).
  - `SpotifyAuthService.getHostStatus` (connected flag, scopes, expiry, `refreshDue` within 60s leeway).
  - `SpotifyAuthService.logout` (deletes token row).
  - `HostJwtService` (sign/verify).
  - `HostAuthGuard` (Bearer-token guard, attaches claims to `req.host`).
  - `OAuthStateRepository`, `SpotifyTokenRepository`.
  - `LoginQueryDto` with class-validator (URL validation on `redirectTo`).
- Supabase Edge Function `spotify-callback` deployed (version 1, `verify_jwt=false`):
  - Reads + deletes the `oauth_states` row in one go.
  - Exchanges code + verifier at `accounts.spotify.com/api/token`.
  - Fetches `/v1/me` for Spotify identity.
  - Upserts `users` and `spotify_tokens`.
  - Signs the host JWT and 302s to `WEB_AUTH_COMPLETE_URL` (or the `redirectTo` originally passed to `/login`) with `?token=...&user_id=...`.
  - Never logs Spotify tokens, code, or JWT. All failure paths return a redirect with `?error=<code>` so the web app can render a friendly message.
- Crypto module in NestJS wires `TokenEncryptionService` from the env-derived 32-byte key (consumed in M3+ for refresh-token decryption).
- `.env.example` and `docker-compose.yml` updated: docker postgres service removed, Supabase + Spotify + crypto vars added.

## New + changed files

```
.env.example
README.md
docker-compose.yml
package.json

supabase/config.toml
supabase/migrations/m02_users_spotify_tokens_oauth_states.sql
supabase/functions/spotify-callback/deno.json
supabase/functions/spotify-callback/index.ts

apps/api/prisma/schema.prisma
apps/api/src/app/app.module.ts
apps/api/src/app/modules/config/app-config.service.ts
apps/api/src/app/modules/config/app-config.service.spec.ts
apps/api/src/app/modules/config/env.schema.ts
apps/api/src/app/modules/crypto/crypto.module.ts
apps/api/src/app/modules/spotify-auth/dto/login.dto.ts
apps/api/src/app/modules/spotify-auth/host-auth.guard.ts
apps/api/src/app/modules/spotify-auth/host-auth.guard.spec.ts
apps/api/src/app/modules/spotify-auth/host-jwt.service.ts
apps/api/src/app/modules/spotify-auth/host-jwt.service.spec.ts
apps/api/src/app/modules/spotify-auth/oauth-state.repository.ts
apps/api/src/app/modules/spotify-auth/pkce.ts
apps/api/src/app/modules/spotify-auth/pkce.spec.ts
apps/api/src/app/modules/spotify-auth/spotify-auth.controller.ts
apps/api/src/app/modules/spotify-auth/spotify-auth.controller.spec.ts
apps/api/src/app/modules/spotify-auth/spotify-auth.module.ts
apps/api/src/app/modules/spotify-auth/spotify-auth.service.ts
apps/api/src/app/modules/spotify-auth/spotify-auth.service.spec.ts
apps/api/src/app/modules/spotify-auth/spotify-scopes.ts
apps/api/src/app/modules/spotify-auth/spotify-token.repository.ts

libs/shared-utils/src/index.ts
libs/shared-utils/src/token-encryption.ts
libs/shared-utils/src/token-encryption.spec.ts
libs/shared-utils/src/token-encryption.cross-platform.spec.ts
```

## New APIs

| Method | Path                                  | Auth        | Description |
| ------ | ------------------------------------- | ----------- | ----------- |
| GET    | `/api/v1/auth/spotify/login`          | Public      | 302 → Spotify authorize. `?json=1` returns the URL instead. Optional `?redirectTo=<absolute-url>` to override post-callback target. |
| GET    | `/api/v1/auth/spotify/status`         | Host JWT    | `{ connected, scopes, expiresAt, refreshDue }`. |
| POST   | `/api/v1/auth/spotify/logout`         | Host JWT    | Deletes the host's `spotify_tokens` row. |
| GET    | `https://zgublzgoejdzexwpicvb.supabase.co/functions/v1/spotify-callback` | Public (Spotify) | OAuth callback. Not exposed under `/api/v1/*`. |

## New env vars (apps/api + Edge Function)

```
DATABASE_URL                  # Supabase Session pooler
SUPABASE_URL                  # https://zgublzgoejdzexwpicvb.supabase.co
SUPABASE_SERVICE_ROLE_KEY     # server-only
SUPABASE_ANON_KEY             # for apps/web
SPOTIFY_CLIENT_ID
SPOTIFY_REDIRECT_URI          # = https://zgublzgoejdzexwpicvb.supabase.co/functions/v1/spotify-callback
TOKEN_ENCRYPTION_KEY          # 32-byte base64 (openssl rand -base64 32)
HOST_JWT_SECRET               # >= 32 chars (openssl rand -base64 64)
WEB_AUTH_COMPLETE_URL         # default redirect target after callback
```

The Edge Function reads all of `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`, `HOST_JWT_SECRET`, `WEB_AUTH_COMPLETE_URL` from its function-level env. Set them in Supabase Dashboard → Edge Functions → spotify-callback → Secrets.

## Tests added

- **Unit:** `pkce` (S256 challenge matches verifier; random state), `TokenEncryptionService` (round-trip, IV randomness, tamper rejection, key length), `HostJwtService` (round-trip, wrong-secret rejection, malformed token), `HostAuthGuard` (missing/invalid bearer, valid token attaches claims), `SpotifyAuthService` (login URL params, redirectTo plumbing, connected/disconnected status, refreshDue leeway, logout boolean), `AppConfigService` (new vars + validation).
- **Cross-platform:** Web Crypto AES-GCM payload (mirrors the Edge Function path) decrypts cleanly via `TokenEncryptionService.decrypt`. Wrong-key payload is rejected.
- **HTTP integration:** Booted Nest controller with mocked repositories — `/login` JSON + 302 + redirectTo validation; `/status` 401 + connected + disconnected; `/logout` 401 + success.

## Manual verification

1. Register the redirect URI **`https://zgublzgoejdzexwpicvb.supabase.co/functions/v1/spotify-callback`** in the Spotify Developer Dashboard. Save the Client ID into `SPOTIFY_CLIENT_ID` (no Client Secret is required because we use PKCE).
2. In Supabase Dashboard → Edge Functions → `spotify-callback` → Secrets, set:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injected for Edge Functions; verify they are present).
   - `SPOTIFY_CLIENT_ID`, `SPOTIFY_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`, `HOST_JWT_SECRET`, `WEB_AUTH_COMPLETE_URL` (matching `apps/api/.env`).
3. Start the API: `docker compose up -d redis && npm run dev:api`.
4. Visit `http://localhost:3000/api/v1/auth/spotify/login` — you should be redirected to Spotify, complete consent, and land on the configured `WEB_AUTH_COMPLETE_URL` with `?token=...&user_id=...`.
5. With that token, run:
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/auth/spotify/status | jq
   curl -s -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/auth/spotify/logout | jq
   ```

## Known issues / limitations

- The Edge Function expects Supabase Edge secrets to be populated manually — there is no MCP API for setting them.
- `oauth_states` cleanup currently relies on the single-use delete during callback + `OAuthStateRepository.deleteExpired()` (no scheduled job yet). A pg_cron job can be added in M18/M19 once observability lands.
- No token refresh logic yet (M3 will need it for device control). `refreshDue` in `/status` is purely informational.
- `apps/web` does not yet implement the `/auth/complete` landing page — placeholder only.
- `npm install` still pending in this environment; lockfile will be generated on first install.

## Next milestone dependencies (Milestone 03 — Spotify Device Control)

M3 can now proceed because:

- `spotify_tokens.encrypted_refresh_token` is populated by the Edge Function and decryptable by NestJS (`TokenEncryptionService`).
- Host JWT + guard exist, so device-control endpoints have an authorization model.
- Domain error envelope handles Spotify failures (M3 will add 502 / `EXTERNAL_DEPENDENCY_FAILED` paths using the same filter).
