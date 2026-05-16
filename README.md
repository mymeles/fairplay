# FairPlay Party DJ — Codex Implementation Pack

This folder is designed to be dropped into a repo and used directly with Codex / GPT-5.5 to implement the system step by step.

## Product Summary

FairPlay Party DJ is a house-party music queue platform.

A host connects a Spotify Premium account. Guests join a party session through QR code + session key. Guests can search Spotify metadata, suggest tracks, vote, and spend free party tokens to boost or challenge locked tracks. The system maintains an internal fair queue and appends only the next 1–2 eligible tracks to the host's Spotify queue.

## Important Product Rules

1. The app does **not** stream audio.
2. The backend only controls the host's Spotify Premium playback device through the host's OAuth token.
3. Guests never authenticate with Spotify.
4. Guests suggest, vote, and spend free party tokens inside the internal app queue.
5. The internal queue is the source of truth.
6. Spotify's queue is only a short buffer of 1–2 tracks.
7. Tokens are free session credits, not money.
8. Tokens never directly trigger Spotify playback.
9. Lock-window/challenge logic changes only internal queue state.
10. Every milestone must be testable before moving forward.

## Folder Structure

```text
00_master/        Master context, build order, Codex kickoff instructions
01_standards/     Programming standards, coding style, API style
02_architecture/  System architecture, data model, Spotify integration rules
03_milestones/    One implementation document per milestone
04_prompts/       Handy prompts for Codex/GPT-5.5
05_operations/    Deployment, logging, observability, runbooks
06_frontend/      Gen-Z webapp layout and UI/UX guide
07_testing/       Testing strategy and load testing plans
```

## Recommended Start

Give Codex this file first:

```text
04_prompts/CODEX_MASTER_START_PROMPT.md
```

Then implement milestones in order from:

```text
03_milestones/MILESTONE_01_PROJECT_FOUNDATION.md
```

Do not skip milestones. Do not implement real payments in the MVP.

## Current Implementation Status

- **Milestone 01 — Project Foundation:** complete. Nx monorepo with `apps/api` (NestJS), `apps/web` (Next.js placeholder), `apps/runner` (BullMQ placeholder), `libs/shared-types`, `libs/shared-utils`. Health endpoints, Redis health check, structured Pino logging, standard error envelope, validation pipe, Docker Compose for all services.
- **Milestone 02 — Spotify Host Authentication:** complete. Hosted on Supabase project `zgublzgoejdzexwpicvb` (`PartyVote`). NestJS handles `/login`, `/status`, `/logout` (PKCE + host JWT guard). Supabase Edge Function `spotify-callback` is the registered Spotify redirect URI: it exchanges code+verifier, fetches `/v1/me`, AES-256-GCM-encrypts the refresh token, upserts `users` + `spotify_tokens`, signs an HS256 host JWT, and 302s to the web app. Postgres now lives on Supabase (`oauth_states` added for single-use PKCE state). RLS enabled with explicit deny for anon/authenticated; only the service-role key (NestJS + Edge Function) can read tokens.
- **Milestone 03 — Spotify Device Control:** complete. New `apps/api/src/app/modules/spotify-playback/` module: `SpotifyPlaybackAdapter` wraps `GET /v1/me/player/devices`, `GET /v1/me/player`, `PUT /v1/me/player`; `SpotifyTokenRefreshService` refreshes the host's access token (encrypted, cached in Postgres); `SpotifyDeviceService` orchestrates with one-shot 401 retry and persists the host's selected device; `HostDeviceController` exposes `GET /api/v1/host/spotify/devices`, `GET /api/v1/host/spotify/playback-state`, `POST /api/v1/host/spotify/device/select`. New domain error codes `SPOTIFY_AUTH_FAILED`, `SPOTIFY_PREMIUM_REQUIRED`, `SPOTIFY_RATE_LIMITED`, `SPOTIFY_NO_ACTIVE_DEVICE`, `SPOTIFY_DEVICE_NOT_FOUND`. Migration `m03_spotify_playback.sql` adds `spotify_tokens.encrypted_access_token` and `users.selected_device_id`. 70 unit tests pass.
- **Milestone 04 — Party Session Creation and Guest Join:** complete. New `apps/api/src/app/modules/sessions/` module: `JoinCodeService` (Crockford-ish 6-char alphabet, dedupe against active sessions), `QrTokenService` (32-byte url-safe random + sha256 hash for storage; constant-time verify), `SessionService` (lifecycle: create → get → end with ownership check; `loadJoinable` for the guest path). New `apps/api/src/app/modules/guests/` module: `GuestJwtService` (HS256, audience `fairplay:guest`, `sid` claim), `GuestAuthGuard`, `GuestService` (verifies joinCode or qrToken proof, creates `session_guests` + `guest_wallets` row, signs guest JWT; reuses an existing guest by `device_hash` on rejoin). Endpoints: `POST /api/v1/sessions`, `GET /api/v1/sessions/by-code/:joinCode` (public, minimal projection), `GET /api/v1/sessions/:sessionId` (host only), `POST /api/v1/sessions/:sessionId/join` (public, accepts `joinCode` OR `qrToken`), `POST /api/v1/sessions/:sessionId/end`. Migration `m04_party_sessions.sql` adds `party_sessions`, `session_guests`, `guest_wallets` with RLS deny-anon policies and a partial unique index on `join_code WHERE status='ACTIVE'`. Default session settings (`DEFAULT_SESSION_SETTINGS` in `@fairplay/shared-types`). 124 unit tests pass; full happy + sad path verified live (create → lookup-by-code → join with code → join with QR → wrong code → end → join-after-end returns 410). Hand-off: [03_milestones/HANDOFF_MILESTONE_04.md](03_milestones/HANDOFF_MILESTONE_04.md).
- **Milestone 05 — Proximity Gate:** complete. New `apps/api/src/app/modules/proximity/` module: `proximity-signals` (Haversine distance, accuracy-slack, constant-time Wi-Fi compare, sha-shaped device check), `JoinTrustScorer` (pure scorer, doc-pinned weights `qrTokenValid=40 / joinCodeValid=25 / gpsWithinRadius=25 / wifiHashMatch=30 / lowRiskDevice=10`, threshold 50), `ProximityService` (orchestrates signals, logs without leaking lat/lng or Wi-Fi hashes, allows-by-default in advisory mode and enforces threshold when `proximityRequired=true`). Wired into `POST /sessions/:sessionId/join`. Join body extended with optional `location { lat, lng, accuracyMeters }` and `wifiHash`; create-session body extended with optional `venue { lat, lng, radiusMeters }` and `venueWifiHash`. The session summary now exposes `venue` and `hasVenueWifi` (the hash itself is never returned). Migration `m05_proximity_gate.sql` adds `party_sessions.venue_wifi_hash`. Also fixed a settings-merge bug exposed by the M04 controller path: `class-transformer` instantiated the override DTO with explicit `undefined` keys, which the spread merged over the defaults; `SessionService.createSession` now skips undefined keys. 164 unit tests pass; live E2E confirmed: code-only blocked, code+far GPS blocked, code+matching Wi-Fi (55) admitted, code+GPS in radius+device fingerprint (60) admitted with `distanceMeters` reported. Hand-off: [03_milestones/HANDOFF_MILESTONE_05.md](03_milestones/HANDOFF_MILESTONE_05.md).
- **Milestone 06 — Track Search and Normalization:** complete. New `apps/api/src/app/modules/tracks/` module: `SpotifySearchAdapter` calls Spotify `GET /v1/search?type=track`, `TrackNormalizer` maps Spotify track payloads into the internal `TrackDto`, `TrackSearchService` scopes guest search to the joined session, uses the host's Spotify token with one-shot 401 refresh, caches normalized search results in Redis for 60s, filters explicit tracks when `settings.allowExplicitTracks=false`, and stores a short Redis backoff key on Spotify 429. `TrackRepository` upserts durable normalized tracks without creating queue entries. Shared `TrackDto` added to `@fairplay/shared-types`. Migration `20260515171359_m06_track_search_and_normalization.sql` adds `tracks` with RLS deny-anon policy. Endpoints: `GET /api/v1/sessions/:sessionId/search?q=...` (guest JWT scoped to that session), `POST /api/v1/tracks/normalize` (guest JWT, validates a Spotify-like track payload, upserts and returns `TrackDto`). 189 API unit/controller tests pass; API build and lint pass. Railway deploy `89c65be5-6be0-46d9-8193-1d704b4ca544` succeeded; live health and normalize smoke passed. Hand-off: [03_milestones/HANDOFF_MILESTONE_06.md](03_milestones/HANDOFF_MILESTONE_06.md).
- **Milestone 07 — Internal Queue:** complete. New `apps/api/src/app/modules/queue/` module: `QueueEntryRepository` (Prisma access to `queue_entries`, helpers for cooldown probe and per-guest cap), `RedisQueueRepository` (owns the `party:{sessionId}:pending` ZSET — best-effort writes, Postgres remains authoritative), `QueueService` (re-normalizes a guest-submitted Spotify payload, upserts `tracks`, enforces `maxSuggestionsPerGuest` and `duplicateCooldownSeconds`, creates the entry with `status=PENDING` and `score=0`, and ZADDs to Redis), `QueueController`. Shared `QueueEntryDto` / `QueueEntryStatus` added to `@fairplay/shared-types`. Migration `20260515184447_m07_internal_queue.sql` adds `queue_entries` with status-check constraint, RLS deny-anon, and `set_updated_at` trigger. Endpoints: `POST /api/v1/sessions/:sessionId/queue` (guest adds a track), `GET /api/v1/sessions/:sessionId/queue` (lists ordered queue, excludes REMOVED/VETOED), `DELETE /api/v1/queue/:entryId` (adder retracts their own PENDING entry; host force-removal is M14). Initial score is `0` and gets replaced when M09 ships ScoringService. 215 API unit/controller tests pass; API build and lint pass. Railway deploy `62878c20-9f9d-4e58-ac04-cc561588061a` succeeded; live add → duplicate-cooldown (409) → list → delete (REMOVED) smoke passed. Hand-off: [03_milestones/HANDOFF_MILESTONE_07.md](03_milestones/HANDOFF_MILESTONE_07.md).
- **Milestone 08 — Voting System:** complete. New `apps/api/src/app/modules/voting/` module: `VoteRepository` (txn-aware `findForEntryGuest`/`upsert`/`delete`), `VoteRateLimiter` (Redis fixed-window — 12 actions / 10s per guest, fails open on Redis outage), `VoteService` orchestrates `rate-limit → load+scope entry → prisma.$transaction { vote upsert + queue_entries counter+score delta } → refresh ZSET if entry is PENDING`. Locked/queued/playing entries record votes but stay frozen in rank until M10. Migration `20260515190443_m08_voting_system.sql` adds `votes` with `(entry_id, guest_id)` unique, RLS deny-anon, value-check ±1. Endpoints: `POST /api/v1/queue/:entryId/vote`, `DELETE /api/v1/queue/:entryId/vote`. 244 API tests pass (215 prior + 29 new). Railway deploy `6761c7fa-df3c-4409-87fe-f0fa4d08ed24` succeeded; live upvote → idempotent re-cast → flip → invalid-value → DELETE → rate-limit smoke passed. Hand-off: [03_milestones/HANDOFF_MILESTONE_08.md](03_milestones/HANDOFF_MILESTONE_08.md).
- **Milestone 09 — Scoring Engine:** complete. New `apps/api/src/app/modules/scoring/` module: `ScoringService` (pure calculator implementing `upvoteWeight * log(1+upvotes) - downvoteWeight*downvotes + boostWeight*boostCredits + ageWeight*minutesWaiting + hostPinWeight*hostPinned`; coalesces missing settings, clamps negative ages), `ScoreRebuildService` (`recalculateEntry` / `recalculateSession` / `rebuildRedisProjection` — bulk ZADD via `setPendingBulk`, skips DB writes within `SCORE_WRITE_EPSILON=1e-4`), `ScoringDevController` (`POST /api/v1/dev/sessions/:sessionId/recalculate-scores`, 403 in production via `AppConfigService.isProduction`). Shared types extended with `ScoringWeights` + `DEFAULT_SCORING_WEIGHTS` attached to `SessionSettings.scoring`. **No DB migration** — additive setting coalesced at the SessionRepository read seam so old session rows just pick up defaults. Replaced M07's hardcoded `INITIAL_SCORE=0` in `QueueService.addTrack` and M08's `computeInterimScore(...)` in `VoteService` with `scoring.calculate(...)` at the same call sites. Two new modules: `ScoringModule` (pure, dep-less; imported by QueueModule + VoteModule) and `ScoreRebuildModule` (imports queue/session/scoring; hosts the dev controller) — split to avoid a cycle. 265 API tests pass (244 prior + 21 new). Railway deploy `4b2e9e86-cbdc-4935-a894-55e94df21eba` succeeded; live upvote on a session with no-`scoring` settings JSON returned `score=1.402` (matches `2*log(2)+aging`), brand-new entries still score 0, aged entries rank above fresh ones, dev endpoint correctly 403s in prod. Hand-off: [03_milestones/HANDOFF_MILESTONE_09.md](03_milestones/HANDOFF_MILESTONE_09.md).
- **Milestone 10 — Lock Window and Free Token Challenge:** complete and deployed. New `apps/api/src/app/modules/lock-window/` module: `LockWindowService` locks the top `settings.lockSize` pending entries by moving them from `party:{sessionId}:pending` to `party:{sessionId}:locked`, writes `status=LOCKED` + `lockedUntil`, and releases expired locks back to `PENDING` through `ScoreRebuildService.recalculateEntry`; `LockWindowScheduler` scans active sessions every 10 seconds; `ChallengeService` transactionally spends one existing `guest_wallets.challenge_tokens` credit and unlocks a `LOCKED` entry without calling Spotify; `LockWindowController` exposes `POST /queue/:entryId/challenge-lock` (guest-only) and `POST /queue/:entryId/veto` (host-only for PENDING/LOCKED entries). Migration `20260515223415_m10_lock_window.sql` adds a partial index for expired-lock scans and was applied to Supabase; no new tables. 288 API tests pass (265 prior + 23 new); API build and lint pass, with the existing `apps/api/src/main.ts` console warning still present. Railway deploy `6e12f0eb-ea3f-4bca-a8f2-358a524e3537` succeeded; health/db/redis and M10 unauthenticated route guards smoked live. Hand-off: [03_milestones/HANDOFF_MILESTONE_10.md](03_milestones/HANDOFF_MILESTONE_10.md).
- **Milestone 11 — Real-Time WebSockets:** complete and deployed. Added `apps/api/src/app/modules/realtime/` with `PartyGateway` (Socket.IO namespace `/party`), `RealtimeEventPublisher`, and room helpers for `party:{sessionId}`, `host:{sessionId}`, and `guest:{guestId}`. Guest sockets authenticate with guest JWTs and automatically join only their party + guest rooms; host sockets authenticate with host JWTs and must emit `host.join_session` with an owned session before joining `host:{sessionId}`. Shared realtime envelope/types now live in `@fairplay/shared-types`: every event includes `{ type, sessionId, sequence, emittedAt, payload }`, with per-session monotonically increasing sequence numbers. Queue add/remove, vote cast/remove, lock/unlock/veto, and challenge-token spend now publish `queue.updated`, `vote.updated`, `track.locked`, `track.unlocked`, and `token.updated`; future publisher methods are in place for session, runner, now-playing, and Spotify-dispatch events. HTTP and Socket.IO CORS now allow local dev origins plus the configured `WEB_AUTH_COMPLETE_URL` origin. No DB migration. 300 API tests pass (288 prior + 12 new); API build and lint pass, with the existing `apps/api/src/main.ts` console warning still present. Railway deploy `6829df47-d79b-4062-835f-18b9ed52b73d` succeeded; live health/db/redis and unauthenticated Socket.IO `/party` rejection smoked. Hand-off: [03_milestones/HANDOFF_MILESTONE_11.md](03_milestones/HANDOFF_MILESTONE_11.md).
- **Milestone 12 — Spotify Queue Runner:** complete and deployed. New `apps/api/src/app/modules/runner/`: `SpotifyQueueAdapter` (typed wrapper around `GET/POST /v1/me/player/queue`, maps 401/403/404/429/5xx to `DomainError`s; tests pass `FETCHER` so Spotify is never hit), `SpotifyCircuitBreaker` (per-host `CLOSED → OPEN → HALF_OPEN → CLOSED` with exp-backoff cooldown, Retry-After honoring, and explicit `forceOpen`), `RunnerStateService` (per-session `IDLE | ACTIVE | BACKING_OFF | DISABLED` state, publishes `runner.status_changed` only on real transitions), `QueueDispatchService` (load session → check state + breaker → count buffered → pick top PENDING from Redis with 5-deep reconcile → acquire Redis dispatch lock `runner:dispatch:{sessionId}` (SET NX EX 15s) → re-read inside lock → refresh token with one-shot 401 retry → enqueue → mark `QUEUED_TO_SPOTIFY` → publish `track.queued_to_spotify` + `queue.updated{reason:entry_queued_to_spotify}`), `RunnerWorker` (`OnModuleInit` setInterval at `RUNNER_TICK_MS`, gated by `RUNNER_ENABLED`, guards against overlapping ticks). Buffer depth counted from our DB (`countSpotifyBufferedBySession`) so the runner doesn't push past `settings.spotifyQueueDepthTarget`. Shared types: new `TrackQueuedToSpotifyPayload` + `RunnerStatusChangedPayload`, extended `QueueUpdatedPayload.reason` with `entry_queued_to_spotify`. No DB migration. New env: `RUNNER_ENABLED` (default `false`), `RUNNER_TICK_MS` (1000-60000, default 5000). 338 API tests pass (300 prior + 38 new); build/lint clean (one pre-existing main.ts console warning). Railway deploy `6bac8a1e-8149-4990-b990-62e5ce60464d` succeeded with `RUNNER_ENABLED=true`; process stayed up across ~12 runner ticks (uptime 163s → 223s) confirming no crash path in any guard. Full Spotify happy-path live smoke needs a real Spotify-connected host with an active device — runbook in the handoff. Hand-off: [03_milestones/HANDOFF_MILESTONE_12.md](03_milestones/HANDOFF_MILESTONE_12.md).
- **Milestone 13 — Now-Playing Sync:** complete and deployed. New `apps/api/src/app/modules/now-playing/`: `NowPlayingService` (per-session reconcile — validates session, refreshes host token with one-shot 401 retry, calls `SpotifyPlaybackAdapter.getPlaybackState`, matches Spotify's currently-playing against the queue, transitions `QUEUED_TO_SPOTIFY/PENDING/LOCKED → PLAYING` for matches and old `PLAYING → PLAYED`, handles paused / no_active_device / idle / external-track / host_disconnected / rate-limited explicitly), `PlaybackPoller` (`OnModuleInit` setInterval at `NOW_PLAYING_TICK_MS`, gated by `NOW_PLAYING_ENABLED`, overlap-guarded). Extended `QueueEntryRepository` with `findPlayingBySession`, `findBySessionAndTrackUriWithTrack`, `markPlaying`, `markPlayed`. Strongly typed `publishNowPlayingUpdated` against the new `NowPlayingUpdatedPayload` shared type (`state, trackUri, entryId, isInternal, progressMs, deviceId`). No DB migration. New env: `NOW_PLAYING_ENABLED` (default `false`), `NOW_PLAYING_TICK_MS` (1500-60000, default 6000). 355 API tests pass (338 prior + 17 new); build/lint clean. Railway deploy `6b58553e-14d2-4b1c-80e0-b43eb79a2c1b` succeeded with `NOW_PLAYING_ENABLED=true`; process survived 100+ seconds with both the runner (M12) and now-playing poller (M13) ticking concurrently across all active sessions. Hand-off: [03_milestones/HANDOFF_MILESTONE_13.md](03_milestones/HANDOFF_MILESTONE_13.md).

## Hosted endpoints

- **API (Railway):** https://api-production-7ee5.up.railway.app/api/v1
  - `GET /health`, `/health/db`, `/health/redis` — public service + dependency health
  - `GET /auth/spotify/login?json=1` — returns the Spotify authorize URL (PKCE state row created in Supabase `oauth_states`)
  - `GET /auth/spotify/status`, `POST /auth/spotify/logout` — host-only (Bearer host JWT)
  - `GET /host/spotify/devices`, `GET /host/spotify/playback-state`, `POST /host/spotify/device/select` — host-only (M03)
  - `POST /sessions`, `GET /sessions/:sessionId`, `POST /sessions/:sessionId/end` — host-only (M04). M05: `POST /sessions` body now accepts optional `venue { lat, lng, radiusMeters }` + `venueWifiHash`.
  - `GET /sessions/by-code/:joinCode`, `POST /sessions/:sessionId/join` — public, M04. M05: join body now accepts optional `location { lat, lng, accuracyMeters }` + `wifiHash`; response includes `proximity { allowed, score, threshold, reasons[], distanceMeters }`.
  - `GET /sessions/:sessionId/search?q=...` — guest-only (Bearer guest JWT whose `sid` matches `:sessionId`). Uses the host's Spotify token, returns normalized `TrackDto[]`, filters explicit tracks if the session disallows them, and caches results in Redis.
  - `POST /tracks/normalize` — guest-only. Accepts a Spotify-like track payload, validates/normalizes it, upserts `tracks`, and returns `TrackDto`.
  - `POST /sessions/:sessionId/queue` — guest-only (M07). Accepts a Spotify-like track payload, upserts the track, enforces per-guest cap + duplicate cooldown, creates a `PENDING` `queue_entries` row at `score=0`, and ZADDs `party:{sessionId}:pending`.
  - `GET /sessions/:sessionId/queue` — guest-only. Returns queue entries ordered by score desc, createdAt asc, excluding REMOVED/VETOED.
  - `DELETE /queue/:entryId` — guest-only. The adder may retract their own PENDING entry; host moderation lands in M14.
  - `POST /queue/:entryId/vote` — guest-only (M08). Body `{ "value": 1 | -1 }`. Idempotent re-cast; flips supported. Rate-limited at 12 actions / 10s per guest. Scores now follow the M09 formula (`upvoteWeight * log(1+upvotes) − downvoteWeight*downvotes + boostWeight*boostCredits + ageWeight*minutesWaiting + hostPinWeight*hostPinned`).
  - `DELETE /queue/:entryId/vote` — guest-only. Removes the guest's vote for this entry. Idempotent.
  - `POST /queue/:entryId/challenge-lock` — guest-only (M10). Consumes one free challenge token from the caller's session wallet and unlocks a `LOCKED` entry back to `PENDING`; does not call Spotify and does not guarantee playback.
  - `POST /queue/:entryId/veto` — host-only (M10). Marks a PENDING/LOCKED entry `VETOED` and clears it from both pending and locked Redis projections.
  - `POST /dev/sessions/:sessionId/recalculate-scores` — non-prod only (M09). Returns 403 in production. Rebuilds Postgres scores and the Redis ZSET projection from scratch.
  - Socket.IO namespace `/party` — realtime (M11). Connect with `io("https://api-production-7ee5.up.railway.app/party", { auth: { token } })`. Guest JWTs join `party:{sessionId}` + `guest:{guestId}` automatically; host JWTs emit `host.join_session` with `{ "sessionId": "..." }` to join `host:{sessionId}` after ownership validation. Events use the shared envelope `{ type, sessionId, sequence, emittedAt, payload }`; current producers emit `queue.updated`, `vote.updated`, `track.locked`, `track.unlocked`, and `token.updated`.
- **Spotify OAuth callback (Supabase Edge Function):** https://zgublzgoejdzexwpicvb.supabase.co/functions/v1/spotify-callback — register this exact URL in the Spotify Developer Dashboard.
- **Frontend (Vercel):** not deployed yet — see Milestone 17. The `WEB_AUTH_COMPLETE_URL` Edge Function secret currently points to `http://localhost:3001/auth/complete` for local development.

## Deployment

- **Railway project:** `partyVote` (workspace: Meles Meles's Projects). Two services: `api` (Dockerfile build) + `Redis` (Railway database plugin, internal URL only). The api consumes Redis via `REDIS_URL=${{Redis.REDIS_URL}}`.
- **Build:** Multi-stage Dockerfile in `apps/api/Dockerfile`. The build stage compiles `libs/shared-types`, `libs/shared-utils`, and the api in dependency order, then `prisma generate` runs against the schema. The run stage copies `node_modules` from the **build** stage (not deps) so the generated Prisma client is included, plus the compiled libs (which expose `dist/index.js` via their `main` field).
- **Deploy:** `railway up --detach --ci` from the repo root uploads the build context; `railway.json` selects the Dockerfile and points the healthcheck at `/api/v1/health`.
- **Env parity:** the local `apps/api/.env` and Supabase Edge Function secrets share the same `TOKEN_ENCRYPTION_KEY` and `HOST_JWT_SECRET` so refresh tokens encrypted by the Edge Function decrypt cleanly in the api. Manage Edge Function secrets via `supabase secrets set --project-ref zgublzgoejdzexwpicvb KEY=value`. Manage Railway secrets via `railway variables --set KEY=value`.

## Local Development

### Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (for Postgres + Redis)

### First-time setup

```bash
cp .env.example .env
# Fill in: DATABASE_URL (Supabase Session pooler), SUPABASE_SERVICE_ROLE_KEY,
#         SPOTIFY_CLIENT_ID, TOKEN_ENCRYPTION_KEY, HOST_JWT_SECRET.
# Generate secrets:
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY
openssl rand -base64 64   # HOST_JWT_SECRET

npm install
npm run prisma:generate
docker compose up -d redis
```

> Postgres lives on Supabase. Migrations are applied via Supabase MCP (see `supabase/migrations/`). Use `prisma db pull` only to refresh the Prisma client after a Supabase schema change.

> The Session-pooler hostname is region-shard-specific. The dashboard shows the exact value under Project Settings → Database → Session pooler — for the `zgublzgoejdzexwpicvb` project it is `aws-1-us-west-2.pooler.supabase.com`.

### Spotify Developer Dashboard

Register the FairPlay app at https://developer.spotify.com/dashboard with this exact redirect URI:

```
https://zgublzgoejdzexwpicvb.supabase.co/functions/v1/spotify-callback
```

The Edge Function URL is stable in dev + prod; no tunnel needed.

### Run the stack (mixed local + Docker)

```bash
docker compose up -d redis
npm run dev:api      # NestJS API on :3000
npm run dev:web      # Next.js placeholder on :3001
npm run dev:runner   # Runner heartbeat
```

### Run the stack (fully containerized)

```bash
docker compose up --build
```

### Verify the health endpoints

```bash
curl -s http://localhost:3000/api/v1/health        | jq
curl -s http://localhost:3000/api/v1/health/db     | jq
curl -s http://localhost:3000/api/v1/health/redis  | jq
```

Each response is wrapped in the standard envelope:

```json
{ "data": { "status": "ok", "service": "fairplay-api", "uptimeSeconds": 5, "version": "0.1.0", "checkedAt": "..." }, "meta": { "requestId": "req_..." } }
```

### Tests

```bash
npm run test               # unit tests across api + shared-utils
npm run test:integration   # boots the Nest app and hits /health (requires postgres+redis)
```

Integration tests do not call real Spotify; from Milestone 2 onward Spotify is mocked.
