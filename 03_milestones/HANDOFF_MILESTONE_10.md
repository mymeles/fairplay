# Handoff — Milestone 10: Lock Window and Free Token Challenge

## Completed

- Added `apps/api/src/app/modules/lock-window/`:
  - `LockWindowService` — locks the current top pending entries up to `SessionSettings.lockSize` (default 2), sets `lockedUntil = now + lockDurationSeconds`, removes them from `party:{sessionId}:pending`, and writes them to `party:{sessionId}:locked`.
  - `releaseExpiredLocks(sessionId)` — moves expired `LOCKED` rows back to `PENDING`, clears the locked Redis projection, and calls `ScoreRebuildService.recalculateEntry` so the entry re-enters the pending ZSET with a fresh score.
  - `ChallengeService` — `challengeLock(entryId, guestId, guestSessionId)` verifies guest session scope, requires `LOCKED`, atomically decrements `guest_wallets.challenge_tokens`, unlocks the entry, and recalculates score. It does not call Spotify and does not guarantee playback.
  - `LockWindowScheduler` — scans active, unexpired sessions every 10 seconds and runs lock/release processing. It skips overlapping ticks and logs per-session failures without stopping the rest of the scan.
  - `LockWindowController` — exposes M10 endpoints.
- Extended `RedisQueueRepository` with the locked ZSET helpers:
  - `lockedKey(sessionId)` → `party:{sessionId}:locked`
  - `listTopPendingIds(sessionId, limit)`
  - `addLocked(sessionId, entryId, lockedUntil)`
  - `removeLocked(sessionId, entryId)`
  - `listExpiredLockedIds(sessionId, now)` (repair/debug helper; DB remains authoritative for release).
- Extended `QueueEntryRepository` with lock-window state transitions: `listPendingByIds`, `countActiveLocks`, `listExpiredLocks`, `lockEntry`, `unlockEntry`, and `markVetoed`.
- Extended `GuestWalletRepository` with `spendChallengeToken(...)`, implemented as an atomic `updateMany` guarded by `challengeTokens > 0`.
- Extended `SessionRepository` / `SessionService` with active session ID listing for the scheduler.
- Fixed stale root dev scripts in `package.json` to use inferred Nx project names (`@fairplay/api`, `@fairplay/web`, `@fairplay/runner`) and corrected the README local Redis command.

## Changed files

```text
README.md
package.json
apps/api/src/app/app.module.ts
apps/api/src/app/modules/guests/guest-wallet.repository.ts
apps/api/src/app/modules/lock-window/challenge.service.spec.ts
apps/api/src/app/modules/lock-window/challenge.service.ts
apps/api/src/app/modules/lock-window/lock-window.controller.spec.ts
apps/api/src/app/modules/lock-window/lock-window.controller.ts
apps/api/src/app/modules/lock-window/lock-window.module.ts
apps/api/src/app/modules/lock-window/lock-window.scheduler.spec.ts
apps/api/src/app/modules/lock-window/lock-window.scheduler.ts
apps/api/src/app/modules/lock-window/lock-window.service.spec.ts
apps/api/src/app/modules/lock-window/lock-window.service.ts
apps/api/src/app/modules/queue/queue-entry.repository.ts
apps/api/src/app/modules/queue/redis-queue.repository.spec.ts
apps/api/src/app/modules/queue/redis-queue.repository.ts
apps/api/src/app/modules/sessions/session.repository.ts
apps/api/src/app/modules/sessions/session.service.ts
supabase/migrations/20260515223415_m10_lock_window.sql
```

## New APIs

### `POST /api/v1/queue/:entryId/challenge-lock` (guest-only)

No body. Uses the guest JWT `sid` to enforce session scope.

Returns `200 OK`:

```json
{
  "data": {
    "entry": {
      "id": "queue-entry-uuid",
      "sessionId": "session-uuid",
      "status": "PENDING",
      "score": 4.215,
      "lockedUntil": null
    },
    "wallet": {
      "guestId": "guest-uuid",
      "sessionId": "session-uuid",
      "boostTokens": 3,
      "challengeTokens": 0
    }
  }
}
```

Errors:

- `401` missing/invalid guest JWT.
- `403` guest token scoped to another session.
- `404` unknown entry.
- `409` entry is not `LOCKED`, or the guest has no challenge token.

### `POST /api/v1/queue/:entryId/veto` (host-only)

No body. Host JWT must own the entry's session.

Returns `200 OK`:

```json
{
  "data": {
    "entry": {
      "id": "queue-entry-uuid",
      "sessionId": "session-uuid",
      "status": "VETOED",
      "score": 4.215,
      "lockedUntil": "2026-01-01T00:01:30.000Z"
    }
  }
}
```

Errors:

- `401` missing/invalid host JWT.
- `403` host does not own the session.
- `404` unknown entry.
- `409` entry is outside the M10 veto surface (`PENDING` / `LOCKED`).

## Database / Redis changes

- Migration `20260515223415_m10_lock_window.sql` adds one partial index:

```sql
create index if not exists idx_queue_entries_session_locked_until
    on public.queue_entries(session_id, locked_until)
    where status = 'LOCKED';
```

- No new tables. M10 reuses `queue_entries.locked_until`, `queue_entries.status`, and `guest_wallets.challenge_tokens`.
- Redis:
  - Pending ranking remains `party:{sessionId}:pending`.
  - Locked projection is `party:{sessionId}:locked`, a ZSET scored by `lockedUntil` epoch milliseconds.
- Supabase migration was applied to project `zgublzgoejdzexwpicvb` via the Supabase connector and verified against `pg_indexes`.

## Tests added

23 new API unit/controller tests (288 total):

- `lock-window.service.spec.ts` — top 2 lock; lock window full no-ops; empty Redis pending projection triggers rebuild; expired locks unlock and re-enter pending through scoring; process result counts; host veto success, ownership rejection, and invalid status rejection.
- `challenge.service.spec.ts` — challenge spends token and unlocks; insufficient token leaves lock intact; non-locked status rejected before transaction; cross-session guest rejected.
- `lock-window.controller.spec.ts` — guest auth/UUID validation/challenge call wiring; host auth/veto call wiring.
- `lock-window.scheduler.spec.ts` — active session scan aggregates counts and continues after per-session failure.
- `redis-queue.repository.spec.ts` — top pending ZREVRANGE, locked ZSET add/remove, expired locked lookup.

Verification:

```text
NX_DAEMON=false npx nx test  @fairplay/api --skip-nx-cache  ✅ 288/288
NX_DAEMON=false npx nx build @fairplay/api --skip-nx-cache  ✅
NX_DAEMON=false npx nx lint  @fairplay/api --skip-nx-cache  ✅ (1 pre-existing main.ts console warning)
```

Deployment:

```text
Supabase migration m10_lock_window                            ✅
Railway deploy 6e12f0eb-ea3f-4bca-a8f2-358a524e3537           ✅
GET /health, /health/db, /health/redis                        ✅
POST /queue/:entryId/challenge-lock without guest JWT         ✅ 401
POST /queue/:entryId/veto without host JWT                    ✅ 401
```

## Manual test steps

1. For a fresh environment, apply the Supabase migration.
2. Start Redis and the API:

```bash
docker compose up -d redis
npm run dev:api
```

3. Create or reuse an active session with `settings.lockSize=2`, join as a guest, and add at least three queue entries.
4. Wait for the scheduler tick, then verify the top two `queue_entries` rows are `LOCKED`, have non-null `locked_until`, are absent from `party:{sessionId}:pending`, and are present in `party:{sessionId}:locked`.
5. Vote on a locked entry and confirm counters/score update in Postgres while the entry is not re-added to the pending ZSET.
6. Call `POST /api/v1/queue/:entryId/challenge-lock` with the guest JWT. Confirm one `challenge_tokens` credit is consumed, the entry becomes `PENDING`, `locked_until` is null, and the entry is back in `party:{sessionId}:pending`.
7. Set a locked row's `locked_until` into the past or wait for expiry; confirm the scheduler releases it to `PENDING`.
8. Call `POST /api/v1/queue/:entryId/veto` with the host JWT for a locked row. Confirm it becomes `VETOED` and is removed from both Redis projections.

## Known risks / limitations

- Challenge spend is atomic but not idempotency-keyed. M15 (Session Token Economy) is the right place to add `token_ledger` and request idempotency across all token actions.
- The scheduler intentionally locks before releasing expired entries in a tick so a just-expired lock is not re-locked in the same pass. Future runner work should coordinate dispatch cadence with this behavior.
- Veto scope is intentionally narrow in M10: PENDING/LOCKED only. M14 owns broader host controls for pin/unpin, runner toggles, and Spotify controls.
- The local throwaway `local-test-ui` directory was already gone. Its stale `node local-test-ui/serve.js` listener on `:3001` was stopped. The prior API dev server on `:3000` was left running because it did not block tests.

## Next milestone

Milestone 11 — Real-Time WebSockets.

M10 enables M11 because queue state transitions are now meaningful user-facing events:

1. `track.locked` when entries move from PENDING to LOCKED.
2. `track.unlocked` when locks expire or a guest challenges a lock.
3. `token.updated` when a challenge token is spent.
4. `queue.updated` when veto removes an entry from the active queue.
