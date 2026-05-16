# Handoff — Milestone 06: Track Search and Normalization

## Completed

- Added `TrackDto` to `@fairplay/shared-types`.
- Added `apps/api/src/app/modules/tracks/`:
  - `SpotifySearchAdapter` calls Spotify search metadata only: `GET /v1/search?type=track&q=...&limit=10`.
  - `TrackNormalizer` maps Spotify track payloads into internal `TrackDto`, joins artist names, selects album artwork, and drops malformed/local tracks.
  - `TrackSearchService` loads the active session, uses the host's Spotify token, retries once on 401 via `SpotifyTokenRefreshService.forceRefresh`, filters explicit tracks when `allowExplicitTracks=false`, caches normalized search results in Redis, and stores a short Redis backoff on Spotify 429.
  - `TrackRepository` upserts normalized tracks by `spotify_uri`.
  - `TrackController` exposes M06 endpoints and enforces guest-session scoping.
- Added Prisma `Track` model.
- Applied Supabase migration `20260515171359_m06_track_search_and_normalization.sql` to project `zgublzgoejdzexwpicvb` and repaired migration history so the version is recorded as applied.

## Changed files

```text
README.md
apps/api/prisma/schema.prisma
apps/api/src/app/app.module.ts
apps/api/src/app/common/middleware/request-context.middleware.ts
apps/api/src/app/modules/guests/guest-jwt.service.spec.ts
apps/api/src/app/modules/guests/guest.service.spec.ts
apps/api/src/app/modules/sessions/dto/join-session.dto.ts
apps/api/src/app/modules/sessions/qr-token.service.spec.ts
apps/api/src/app/modules/sessions/session.service.spec.ts
apps/api/src/app/modules/spotify-playback/dto/select-device.dto.ts
apps/api/src/app/modules/spotify-playback/host-device.controller.spec.ts
apps/api/src/app/modules/tracks/*
libs/shared-types/src/index.ts
libs/shared-types/src/tracks.ts
supabase/migrations/20260515171359_m06_track_search_and_normalization.sql
```

The non-track lint edits are mechanical cleanup of pre-existing lint failures so `nx lint @fairplay/api` succeeds.

## New APIs

### `GET /api/v1/sessions/:sessionId/search?q=...`

Authorization: guest JWT only. The JWT `sid` must match `:sessionId`.

Returns:

```json
[
  {
    "spotifyUri": "spotify:track:abc123",
    "spotifyTrackId": "abc123",
    "title": "Levitating",
    "artist": "Dua Lipa",
    "album": "Future Nostalgia",
    "durationMs": 203807,
    "artworkUrl": "https://i.scdn.co/image/...",
    "explicit": false
  }
]
```

### `POST /api/v1/tracks/normalize`

Authorization: guest JWT only. Uses the JWT `sid` to verify the guest still belongs to a joinable session.

Body is the Spotify track subset returned by search:

```json
{
  "id": "abc123",
  "uri": "spotify:track:abc123",
  "name": "Levitating",
  "artists": [{ "name": "Dua Lipa" }],
  "album": {
    "name": "Future Nostalgia",
    "images": [{ "url": "https://i.scdn.co/image/large", "width": 640, "height": 640 }]
  },
  "duration_ms": 203807,
  "explicit": false
}
```

Returns the normalized `TrackDto` and upserts `public.tracks`. It does not create queue entries.

## Database changes

Migration: `supabase/migrations/20260515171359_m06_track_search_and_normalization.sql`

Adds `public.tracks`:

```sql
id uuid primary key
spotify_uri text unique not null
spotify_track_id text not null
title text not null
artist text not null
album text null
duration_ms int not null
artwork_url text null
explicit boolean not null default false
created_at timestamptz not null default now()
```

RLS is enabled with `deny_anon_tracks` for `anon` and `authenticated`; API access continues through the backend's service-role-backed database connection.

## Redis keys

- `party:{sessionId}:track-search:{clean|explicit}:{queryHash}` — normalized search-result cache, TTL 60s.
- `spotify:search:backoff:{hostUserId}` — set after Spotify 429, TTL from `Retry-After` capped at 300s.

## Events emitted

None.

## Tests added

- `track-normalizer.spec.ts` — mapping, optional fields, local/malformed drops, many-track filtering.
- `spotify-search.adapter.spec.ts` — Spotify query construction, empty response, 401, 429 retry-after.
- `track-search.service.spec.ts` — empty query, Redis cache hit, explicit filtering, allow-explicit path, 401 refresh retry, 429 backoff write, active backoff short-circuit, normalize/upsert.
- `track.controller.spec.ts` — guest auth, session-scope mismatch, query validation, search response, normalize validation/upsert.

Verification:

```text
NX_DAEMON=false npx nx build @fairplay/api --skip-nx-cache  ✅
NX_DAEMON=false npx nx test @fairplay/api --skip-nx-cache   ✅ 189/189
NX_DAEMON=false npx nx lint @fairplay/api --skip-nx-cache   ✅ (1 existing console warning)
```

Deployment:

```text
railway up --detach --ci
Deployment 89c65be5-6be0-46d9-8193-1d704b4ca544 ✅ SUCCESS
GET https://api-production-7ee5.up.railway.app/api/v1/health ✅ status=ok
```

Full workspace build/test still has pre-existing non-M06 blockers:

- `@fairplay/web:build` fails during Next prerender with React/styled-jsx `useContext` null.
- `@fairplay/web:test` is missing `jest-environment-jsdom`.
- `@fairplay/runner:test` has no tests and does not pass `--passWithNoTests`.

## Manual verification

Recorded live smoke after deploy:

- Inserted temporary `users` + `party_sessions` rows, minted a guest JWT with the Railway/shared `HOST_JWT_SECRET`, called `POST /api/v1/tracks/normalize`, and deleted the temporary user/session/track rows.
- `POST /tracks/normalize` returned `200` with `spotifyUri=spotify:track:M06SMOKETRACK01`, `spotifyTrackId=M06SMOKETRACK01`, `title=Smoke Song`, `explicit=false`.
- `GET /sessions/:sessionId/search?q=dua` reached the new search service and returned expected `401 UNAUTHORIZED` / `Host has not connected Spotify.` for the temporary host, which intentionally had no Spotify token.

To manually verify with a real Spotify-connected host:

1. Create or reuse an active session and join as a guest to get a guest JWT.
2. Search:

   ```bash
   API=https://api-production-7ee5.up.railway.app/api/v1
   curl -s -H "Authorization: Bearer $GUEST_JWT" \
     "$API/sessions/$SESSION_ID/search?q=dua%20lipa" | jq
   ```

3. Confirm the response is an array of `TrackDto` objects and contains no explicit tracks when the session was created with `"allowExplicitTracks": false`.
4. Normalize/upsert one Spotify-like track:

   ```bash
   curl -s -X POST -H "Content-Type: application/json" \
     -H "Authorization: Bearer $GUEST_JWT" \
     "$API/tracks/normalize" \
     -d '{ "id":"abc123", "uri":"spotify:track:abc123", "name":"Song", "artists":[{"name":"Artist"}], "duration_ms":180000, "explicit":false }' | jq
   ```

5. Confirm `public.tracks` contains the row by `spotify_uri`.

## Known risks / limitations

- Search depends on the host still having a valid Spotify connection; guests do not call Spotify directly.
- Cache is intentionally short (60s) and best-effort; Redis read/write failures do not block search.
- Spotify 429 backoff is scoped per host user for search only. Runner-specific circuit breaking remains M12.
- `POST /tracks/normalize` accepts a Spotify-like payload because the milestone did not define a request body.
- No queue entry is created in M06; M07 owns queue persistence and duplicate/max-suggestion enforcement.

## Next milestone

Milestone 07 — Internal Queue.

M06 enables M07 because queue add can accept a normalized `TrackDto`, upsert it through `TrackRepository`, and then create the first internal `queue_entries` row.
