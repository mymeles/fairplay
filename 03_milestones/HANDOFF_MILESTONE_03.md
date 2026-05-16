# Handoff — Milestone 03: Spotify Device Control

## Architectural change vs. the original milestone doc

The milestone called for storing the host's selected device against the user "until sessions exist." We did exactly that in M03 (added `users.selected_device_id`), and M04's `party_sessions` later added `selected_spotify_device_id` per session — the per-session selector is currently inherited from the user value at session-create time and will be made independently writable in M14 (Host Controls).

The milestone also implied refreshing the access token on demand. We chose to **persist the encrypted access token** (`spotify_tokens.encrypted_access_token`) so the next call doesn't always pay a refresh round-trip. Refresh runs only when the cached token is missing or within 60s of expiry, and on a forced retry after a Spotify 401.

Two production-only fixes also landed here that were strictly speaking pre-existing M02 issues but only surfaced when M03 was wired up: the express type augmentation collision on `Request.host`, and the `?json=1` rejection on `/auth/spotify/login`. See "Known issues / context" below.

## Completed

- **Migration `m03_spotify_playback.sql`** applied to Supabase project `zgublzgoejdzexwpicvb`:
  - `spotify_tokens.encrypted_access_token text` (AES-256-GCM, same wire format as the refresh token).
  - `users.selected_device_id text` (default device the host last picked).
- **Prisma schema** updated to mirror both columns; `prisma generate` regenerated the client.
- **New domain error codes** added to `@fairplay/shared-utils` with HTTP-status mapping, all tested:
  - `SPOTIFY_AUTH_FAILED` → 401
  - `SPOTIFY_PREMIUM_REQUIRED` → 403
  - `SPOTIFY_RATE_LIMITED` → 429 (with `details.retryAfterSec`)
  - `SPOTIFY_NO_ACTIVE_DEVICE` → 404
  - `SPOTIFY_DEVICE_NOT_FOUND` → 404
- **`SpotifyPlaybackAdapter`** — single HTTP boundary for the three Spotify endpoints used in M03. Maps Spotify HTTP statuses into the domain error codes above; never throws raw `fetch` errors. Exposes `getDevices`, `getPlaybackState`, `transferPlayback`. Uses an injectable `Fetcher` so tests run with no network.
- **`SpotifyTokenRefreshService`** — decrypts the refresh token, calls `POST accounts.spotify.com/api/token`, encrypts and stores the new access token (and rotated refresh token if Spotify returned one). Refreshes only when needed (`encryptedAccessToken` missing OR `expiresAt - 60s < now`). `forceRefresh()` bypasses the cache for the 401 retry path.
- **`SpotifyDeviceService`** — orchestrator. `listDevices`/`getPlaybackState`/`selectDevice`. Implements one-shot retry on `SPOTIFY_AUTH_FAILED` (token expired between refresh decision and Spotify call). `selectDevice` cross-checks the requested deviceId against the live device list before transferring playback, then persists `users.selected_device_id`.
- **`HostDeviceController`** — `GET /api/v1/host/spotify/devices`, `GET /api/v1/host/spotify/playback-state`, `POST /api/v1/host/spotify/device/select`. All require host JWT.
- **Token repository** extended (`SpotifyTokenRepository.updateAfterRefresh`) and a new `UserRepository` added with `findById` + `setSelectedDeviceId`.
- **Spotify auth module** now exports `UserRepository` so `SpotifyPlaybackModule` can read the host profile for `selectedDeviceId`.

### Production-deploy fixes that landed alongside M03

These were pre-existing M02 bugs that only blocked production once we deployed; they are listed here because the M03 commit is what surfaced them.

- **Express `Request.host` collision** — `host` is a `readonly string` in `@types/express-serve-static-core`, so the M02 ambient declaration `Request.host?: HostJwtClaims` no longer compiled. Renamed the augmented property to `Request.hostClaims` and updated all callers (`HostAuthGuard`, `SpotifyAuthController`, `HostDeviceController`).
- **`?json=1` rejected by ValidationPipe** — `LoginQueryDto` did not declare `json`, so `forbidNonWhitelisted: true` returned 400. Added an optional `@IsIn(['1'])` field to the DTO.
- **Double-send after `res.redirect`** — when a controller calls `res.redirect()` (`/auth/spotify/login` 302 path), Nest still serializes the return value, hitting "Cannot set headers after they are sent." Added defensive `res.headersSent` checks in `ResponseEnvelopeInterceptor` and `DomainExceptionFilter`.
- **Production build** — fixed three issues that prevented `node dist/main.js` from running on Railway:
  1. `libs/shared-*/package.json` `main` pointed at `src/index.ts`. Changed to `dist/index.js` and added a `build` script per lib.
  2. `libs/*/tsconfig.json` and `apps/api/tsconfig.json` needed `rootDir: "./src"` and an explicit `paths: {}` override so the compiled output sits flat under each `dist/` (instead of `dist/apps/api/apps/api/src/main.js`).
  3. The Dockerfile's run stage copied `node_modules` from the deps stage, which doesn't have the generated Prisma client. Switched to `COPY --from=build /workspace/node_modules`. Also copies `libs/` from the build stage so the just-compiled `dist/` is included.
- **`apps/api/src/main.ts`** — disabled `bufferLogs`, added a startup `console.log`, explicit `0.0.0.0` bind, and a top-level `bootstrap().catch` so any future startup failure prints to stdout instead of vanishing into the buffer.

## New + changed files

```
supabase/migrations/m03_spotify_playback.sql
apps/api/prisma/schema.prisma
apps/api/src/app/app.module.ts
apps/api/src/app/common/filters/domain-exception.filter.ts
apps/api/src/app/common/interceptors/response-envelope.interceptor.ts
apps/api/src/main.ts
apps/api/Dockerfile
apps/api/tsconfig.json

apps/api/src/app/modules/spotify-auth/dto/login.dto.ts
apps/api/src/app/modules/spotify-auth/host-auth.guard.ts
apps/api/src/app/modules/spotify-auth/host-auth.guard.spec.ts
apps/api/src/app/modules/spotify-auth/spotify-auth.controller.ts
apps/api/src/app/modules/spotify-auth/spotify-auth.controller.spec.ts
apps/api/src/app/modules/spotify-auth/spotify-auth.service.spec.ts
apps/api/src/app/modules/spotify-auth/spotify-auth.module.ts
apps/api/src/app/modules/spotify-auth/spotify-token.repository.ts
apps/api/src/app/modules/spotify-auth/user.repository.ts

apps/api/src/app/modules/spotify-playback/spotify-playback.module.ts
apps/api/src/app/modules/spotify-playback/spotify-playback.adapter.ts
apps/api/src/app/modules/spotify-playback/spotify-playback.adapter.spec.ts
apps/api/src/app/modules/spotify-playback/spotify-token-refresh.service.ts
apps/api/src/app/modules/spotify-playback/spotify-token-refresh.service.spec.ts
apps/api/src/app/modules/spotify-playback/spotify-device.service.ts
apps/api/src/app/modules/spotify-playback/spotify-device.service.spec.ts
apps/api/src/app/modules/spotify-playback/host-device.controller.ts
apps/api/src/app/modules/spotify-playback/host-device.controller.spec.ts
apps/api/src/app/modules/spotify-playback/dto/select-device.dto.ts

libs/shared-utils/src/domain-error.ts
libs/shared-utils/src/domain-error.spec.ts
libs/shared-utils/package.json
libs/shared-utils/tsconfig.json
libs/shared-types/package.json
libs/shared-types/tsconfig.json

railway.json   (build/deploy config so Railway uses apps/api/Dockerfile)
README.md
```

## New APIs

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET    | `/api/v1/host/spotify/devices`         | Host JWT | `{ devices: SpotifyDevice[], selectedDeviceId: string \| null }`. |
| GET    | `/api/v1/host/spotify/playback-state`  | Host JWT | `{ active: boolean, state: SpotifyPlaybackState \| null }`. Returns `{active:false, state:null}` on Spotify 204. |
| POST   | `/api/v1/host/spotify/device/select`   | Host JWT | Body `{ deviceId }`. Validates against live device list, transfers playback, persists `users.selected_device_id`. Returns `{ deviceId, transferred: true }`. |

## New env vars

None. M03 reuses `SPOTIFY_CLIENT_ID` (refresh-token endpoint), `TOKEN_ENCRYPTION_KEY` (encrypts the new access token), and `HOST_JWT_SECRET` (host JWT verification).

## Tests added

- **Adapter (`spotify-playback.adapter.spec.ts`)** — devices mapping (incl. dropping null-id devices), empty list, 401→`SPOTIFY_AUTH_FAILED`, 403→`SPOTIFY_PREMIUM_REQUIRED`, 429→`SPOTIFY_RATE_LIMITED` with `retry-after`, `getPlaybackState` 204→null + happy mapping, `transferPlayback` correct PUT body + 404 mapping.
- **Refresh (`spotify-token-refresh.service.spec.ts`)** — cache hit (no network), refresh on missing/expiring access token, refresh-token rotation when Spotify returns a new one, 400/401 from Spotify → `SPOTIFY_AUTH_FAILED`, missing token row → `UNAUTHORIZED`, `forceRefresh()` always hits Spotify.
- **Device service (`spotify-device.service.spec.ts`)** — devices + selectedDeviceId, empty device list, 401→`forceRefresh` then retry once, `SPOTIFY_PREMIUM_REQUIRED` propagates without retry, playback state active/inactive, `selectDevice` rejects unknown deviceId, persists selection.
- **Controller (`host-device.controller.spec.ts`)** — 401 without bearer, devices happy + empty, 403 maps to envelope `SPOTIFY_PREMIUM_REQUIRED`, playback state inactive shape, `selectDevice` validation (missing/invalid deviceId) and success.
- **DomainError** — extended `it.each` to cover the five new codes.

Total: **70 unit tests pass.**

## Manual verification

1. Apply migration via Supabase MCP (`m03_spotify_playback.sql`) — already applied to project `zgublzgoejdzexwpicvb`.
2. Sign in as host via `/api/v1/auth/spotify/login` and complete Spotify consent. (Uses M02 flow.)
3. With the host JWT:
   ```bash
   TOKEN=...
   API=https://api-production-7ee5.up.railway.app/api/v1
   curl -s -H "Authorization: Bearer $TOKEN" "$API/host/spotify/devices"        | jq
   curl -s -H "Authorization: Bearer $TOKEN" "$API/host/spotify/playback-state" | jq
   curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
        -d '{"deviceId":"<one-of-the-ids-above>"}' "$API/host/spotify/device/select" | jq
   ```
4. Negative-path manual checks (no Premium, no active device, expired token) — covered by unit tests; not normally reproducible against your own account.

## Known issues / limitations

- A non-Premium Spotify account cannot be tested live without re-linking; the 403 path is unit-tested only.
- Selected device is per-user, not per-session — M14 will move it onto the active session and add an audit row when changed.
- No telemetry yet (M18). Logs are structured Pino lines.
- The "no active device" Spotify state (204 on `/me/player`) maps to `{active:false, state:null}` in our envelope, not a 404 — this is intentional so the host UI can render "no device active" without an error toast.

## Next milestone dependencies (Milestone 04 — Party Session Creation and Guest Join)

M04 was able to proceed because:

- `users.selected_device_id` exists, so M04's `party_sessions.selected_spotify_device_id` can inherit the host's default at create-time.
- `UserRepository` is already exported from `SpotifyAuthModule`; M04 reused it.
- The five new domain error codes plus the headers-sent fix mean future host endpoints have a consistent envelope/redirect story.
- The Railway deploy now actually boots (`node dist/main.js` works), so future milestones can deploy continuously.
