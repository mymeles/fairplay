# Handoff — Milestone 12: Spotify Queue Runner

## Completed

- Added `apps/api/src/app/modules/runner/`:
  - `SpotifyQueueAdapter` — wraps `GET /v1/me/player/queue` and `POST /v1/me/player/queue`, mapping 204/401/403/404/429/5xx to typed `DomainError`s consistent with `SpotifyPlaybackAdapter`. Uses the shared `FETCHER` DI symbol so tests never hit Spotify.
  - `SpotifyCircuitBreaker` — in-memory `CLOSED → OPEN → HALF_OPEN → CLOSED` state machine, keyed per host user. Generic-failure threshold (3), exponential cooldown (30s base, 5m cap), and explicit Retry-After / forceOpen overrides for 429s and non-retryable errors.
  - `RunnerStateService` — per-session in-memory state machine (`IDLE | ACTIVE | BACKING_OFF | DISABLED`). Publishes `runner.status_changed` only on real transitions (no duplicate IDLE noise). Handles disable on premium/no-device/auth errors and a final `session_ended` transition.
  - `QueueDispatchService` — the orchestrator. For one session per call: validates session → checks state + breaker → counts buffered entries → picks top PENDING from Redis (with a 5-deep reconcile to skip stale ZSET heads) → acquires a Redis dispatch lock → re-reads the entry inside the lock → refreshes the host token (one-shot 401 retry) → calls `POST /me/player/queue` → marks `QUEUED_TO_SPOTIFY` → publishes `track.queued_to_spotify` + `queue.updated` → releases the lock.
  - `RunnerWorker` — `OnModuleInit` starts a `setInterval` at `RUNNER_TICK_MS` (default 5s). Iterates active sessions, calls dispatch once per session per tick, guards against overlapping ticks. Skipped entirely when `RUNNER_ENABLED=false`.
- Extended `QueueEntryRepository` with `countSpotifyBufferedBySession`, `markQueuedToSpotify`, `listPendingByIdsWithTrack`.
- Extended `RedisQueueRepository` with `acquireDispatchLock` / `releaseDispatchLock` (`SET NX EX` + compare-and-delete release).
- Strongly typed the two M12 publisher methods: `publishTrackQueuedToSpotify(TrackQueuedToSpotifyPayload)` and `publishRunnerStatusChanged(RunnerStatusChangedPayload)`.
- Shared types: added `TrackQueuedToSpotifyPayload`, `RunnerStatusState`, `RunnerStatusReason`, `RunnerStatusChangedPayload`. Extended `QueueUpdatedPayload.reason` with `'entry_queued_to_spotify'`.
- Env: added `RUNNER_ENABLED` (default `false`) and `RUNNER_TICK_MS` (1000–60000, default 5000).
- `apps/runner` placeholder is unchanged. M12 lives entirely in the API process so we can reuse the realtime publisher, token-refresh service, and Postgres/Redis singletons without IPC. Splitting the runner into its own process is a horizontal-scale concern documented below.

## Changed files

```text
README.md
apps/api/src/app/app.module.ts
apps/api/src/app/modules/config/app-config.service.ts
apps/api/src/app/modules/config/env.schema.ts
apps/api/src/app/modules/queue/queue-entry.repository.ts
apps/api/src/app/modules/queue/redis-queue.repository.ts
apps/api/src/app/modules/realtime/realtime-event-publisher.ts
apps/api/src/app/modules/runner/queue-dispatch.service.spec.ts
apps/api/src/app/modules/runner/queue-dispatch.service.ts
apps/api/src/app/modules/runner/runner-state.service.spec.ts
apps/api/src/app/modules/runner/runner-state.service.ts
apps/api/src/app/modules/runner/runner.module.ts
apps/api/src/app/modules/runner/runner.worker.spec.ts
apps/api/src/app/modules/runner/runner.worker.ts
apps/api/src/app/modules/runner/spotify-circuit-breaker.spec.ts
apps/api/src/app/modules/runner/spotify-circuit-breaker.ts
apps/api/src/app/modules/runner/spotify-queue.adapter.spec.ts
apps/api/src/app/modules/runner/spotify-queue.adapter.ts
libs/shared-types/src/realtime.ts
```

## How the runner picks a track

1. **Session check** — `SessionService.loadJoinable` (ACTIVE, not expired).
2. **Runner state** — `RunnerStateService.isEnabled`, `isBackingOff`. A 429 or non-recoverable error gates this.
3. **Circuit breaker** — `SpotifyCircuitBreaker.canDispatch(hostUserId)`. Per-host so one bad token doesn't take down all sessions.
4. **Buffer depth** — `countSpotifyBufferedBySession` counts `QUEUED_TO_SPOTIFY + PLAYING` rows. If ≥ `settings.spotifyQueueDepthTarget` (default 1), skip.
5. **Candidate selection** — `listTopPendingIds(sessionId, 5)` against the Redis ZSET, then `listPendingByIdsWithTrack` to filter out anything no longer PENDING (vetoed, removed, locked, already dispatched).
6. **Dispatch lock** — `SET NX EX runner:dispatch:{sessionId} <uuid> 15`. Failed acquisition = another worker is already in flight.
7. **Re-read inside lock** — `findByIdWithTrack(entryId)` to catch a race where the entry was vetoed between pick + lock.
8. **Spotify call** — `enqueueTrack(accessToken, trackUri, deviceId)`. 401 triggers one `forceRefresh` + retry.
9. **Persist + publish** — `markQueuedToSpotify`, `redisQueue.removeEntry`, `publishTrackQueuedToSpotify`, `publishQueueUpdated(reason='entry_queued_to_spotify')`, `markActive`.
10. **Release lock** — compare-and-delete (only delete if we still own it).

## Status state machine

| State | Set by | Cleared by |
| --- | --- | --- |
| `IDLE` | nothing to dispatch / buffer full | next successful dispatch |
| `ACTIVE` | successful dispatch | next idle tick |
| `BACKING_OFF` | 429 Retry-After / breaker open | retryAtMs elapses |
| `DISABLED` | premium_required / no_active_device / auth_failed / session_ended | host re-enables (M14 will own the endpoint) |

`runner.status_changed` is published only on real transitions, so listeners get a clean event stream.

## Realtime events fired by M12

- `track.queued_to_spotify` — `{ entryId, trackUri, spotifyQueuedAt }` per successful dispatch.
- `queue.updated` — `{ reason: 'entry_queued_to_spotify', entryId, status }` so existing queue listeners refresh.
- `runner.status_changed` — `{ state, reason, retryAtMs, lastEntryId?, lastErrorCode? }` on every state transition.

## Database / Redis changes

- **No migration.** All new state lives in-process. The `spotify_queued_at` column already existed on `queue_entries`.
- New Redis key shape: `runner:dispatch:{sessionId}` — short-lived dispatch lock, TTL 15s.

## Tests added

38 new API tests (338 total):

- `spotify-queue.adapter.spec.ts` (8) — happy path, deviceId pass-through, 401/403/404/429/5xx mapping, queue parsing with malformed items dropped, 204 on `getQueue`.
- `spotify-circuit-breaker.spec.ts` (6) — initial CLOSED, threshold opens, cooldown moves to HALF_OPEN, success closes, Retry-After overrides cooldown, forceOpen.
- `runner-state.service.spec.ts` (6) — defaults, transition publish + deduplication, idempotent IDLE, disable/enable round-trip, backoff math, forgetSession final transition.
- `queue-dispatch.service.spec.ts` (12) — happy path; buffer-full skip; no-pending skip; LOCKED race inside lock; lock contention; 401 one-shot refresh retry; persistent 401 disables runner; 403 premium disables; 404 no-device disables; 429 Retry-After sets backoff + opens breaker; back-off path; breaker-open path; session_invalid.
- `runner.worker.spec.ts` (4) — iterates active sessions; swallows per-session failures; no timer when disabled; skips overlapping ticks.

Verification:

```text
NX_DAEMON=false npx nx build @fairplay/api --skip-nx-cache  ✅
NX_DAEMON=false npx nx test  @fairplay/api --skip-nx-cache  ✅ 338/338 (300 prior + 38 new)
NX_DAEMON=false npx nx lint  @fairplay/api --skip-nx-cache  ✅ (1 pre-existing main.ts console warning)
```

## Env vars

| Var | Default | Notes |
| --- | --- | --- |
| `RUNNER_ENABLED` | `false` | Must be `true` for the worker to tick. Production has it on; local dev should leave it off unless you want the runner trying to hit Spotify. |
| `RUNNER_TICK_MS` | `5000` | Interval between ticks. Clamped 1000–60000 by the env schema. |

## Manual verification

After deploy with `RUNNER_ENABLED=true` and `RUNNER_TICK_MS=5000`:

- `GET /health`, `/health/db`, `/health/redis` all `ok`.
- API uptime monitored over 60s — survived ~12 runner ticks (163s → 223s) without crashing the process. Each tick iterates every ACTIVE session and exercises `QueueDispatchService.dispatchNextForSession` — even an empty queue still exercises session-load, runner-state, breaker, buffer-count, and Redis pick-list guards.

To do a full end-to-end live smoke with real Spotify:

1. Open the local UI (see prior milestone runbook), log in with Spotify, select an active device.
2. Create a session, join as a guest, add a track, vote it up so it's the top PENDING.
3. Wait one tick (≤ 5s with default `RUNNER_TICK_MS`).
4. Confirm in Spotify that the track appears in the host's player queue.
5. Inspect the realtime stream: `track.queued_to_spotify` (with `entryId`, `trackUri`, `spotifyQueuedAt`) + `queue.updated` (`reason='entry_queued_to_spotify'`) + `runner.status_changed` (`state='ACTIVE'`).
6. The entry's status is now `QUEUED_TO_SPOTIFY` — `GET /sessions/:id/queue` still lists it (M07 list excludes only REMOVED/VETOED).

## Known risks / limitations

- **Process-local state.** `RunnerStateService` and `SpotifyCircuitBreaker` are in-memory Maps. Fine for a single Railway API instance. If you ever scale `api` horizontally, both must move to Redis or the runner must be pinned to a single replica (the dispatch lock already prevents double-dispatch, but the breaker state would diverge between replicas).
- **`apps/runner` is still a heartbeat.** When the time comes to split it out, the natural move is `RunnerModule` → its own Nest app importing `QueueModule`, `RealtimeModule` (Socket.IO Redis adapter required), and the existing repos. Not blocking for the MVP.
- **Buffer depth is DB-derived, not Spotify-derived.** Counting `QUEUED_TO_SPOTIFY + PLAYING` rows is deterministic and fast, but it means a host who manually adds tracks to their Spotify queue from another client won't be counted. M13 (now-playing sync) is where we can reconcile if needed.
- **Idempotency on retries.** A 5xx after Spotify accepted the queue request would cause us to retry on the next tick and queue the same track twice. Mitigations: the Redis dispatch lock prevents in-tick retries, and the next tick re-reads the entry (now `QUEUED_TO_SPOTIFY`, no longer PENDING). The only window is a transport-level 5xx where the request actually committed — we accept that risk for MVP.
- **No host-driven enable/disable yet.** The runner is enabled per-session implicitly. M14 (Host Controls) will add explicit `POST /sessions/:id/runner/enable|disable`.

## Deployment

```text
Railway env update:  RUNNER_ENABLED=true, RUNNER_TICK_MS=5000
Railway deploy:      6bac8a1e-8149-4990-b990-62e5ce60464d           ✅
GET /health                                                         ✅ status=ok
GET /health/db                                                      ✅ postgres ok
GET /health/redis                                                   ✅ redis ok
Process stayed up across 12+ runner ticks (uptime growth confirmed) ✅
```

## Next milestone

Milestone 13 — Now-Playing Sync.

M12 leaves entries in `QUEUED_TO_SPOTIFY`. M13 polls `GET /v1/me/player` (already wrapped by `SpotifyPlaybackAdapter`) and transitions:

- `QUEUED_TO_SPOTIFY` → `PLAYING` when Spotify says it's the current track.
- `PLAYING` → `PLAYED` when Spotify advances past it.

That state change frees up the buffer slot the runner watches, and publishes `now_playing.updated` (already exposed on the realtime publisher, not yet emitted).
