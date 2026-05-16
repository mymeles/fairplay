# Handoff — Milestone 09: Scoring Engine

## Completed

- Added `apps/api/src/app/modules/scoring/`:
  - `ScoringService` — pure calculator. `calculate(inputs, settings, now?)` implements the M09 formula: `upvoteWeight * log(1+upvotes) - downvoteWeight*downvotes + boostWeight*boostCredits + ageWeight*minutesWaiting + (hostPinned ? hostPinWeight : 0)`. Coalesces missing `settings.scoring` keys against `DEFAULT_SCORING_WEIGHTS`. Clamps clock-skew-negative ages to zero. Rounds to 6 decimal places for stable Decimal+ZSET storage.
  - `ScoreRebuildService` — three methods. `recalculateEntry(entryId)` recomputes one entry's score, writes it back, and refreshes the ZSET if still PENDING. `recalculateSession(sessionId)` loops over every active entry (PENDING/LOCKED/QUEUED_TO_SPOTIFY/PLAYING), writes Postgres scores that drift more than `SCORE_WRITE_EPSILON = 1e-4`, and rebuilds the ZSET. `rebuildRedisProjection(sessionId)` DELs the session ZSET and re-ZADDs the PENDING entries in bulk.
  - `ScoringDevController` — `POST /api/v1/dev/sessions/:sessionId/recalculate-scores`. Returns 403 when `AppConfigService.isProduction` is true, 202 + result otherwise. Logged at WARN so a non-prod accidental trigger is visible.
- Extended `QueueEntryRepository` with `listActiveBySession(sessionId, tx?)` and `setScore(entryId, score, tx?)`. Both accept the shared `PrismaTxn` so callers can run inside a transaction.
- Extended `RedisQueueRepository` with `deletePending(sessionId)` and `setPendingBulk(sessionId, entries[])` (single round-trip ZADD with multiple score/member pairs).
- Shared types: added `ScoringWeights` + `DEFAULT_SCORING_WEIGHTS` and attached `scoring: ScoringWeights` to `SessionSettings`. Removed the M08-era `computeInterimScore` helper (no callers remain).
- Backward-compat for old session rows: `SessionRepository.toRecord` now coalesces missing keys (including `scoring`) against `DEFAULT_SESSION_SETTINGS` at the read seam. No DDL migration needed.
- Replaced the M07 `INITIAL_SCORE = 0` constant in `QueueService.addTrack` with `scoring.calculate(...)`. For a brand-new entry (no votes, no boosts, no pin, age=0) the result is still 0 — semantics preserved.
- Replaced the M08 `computeInterimScore(...)` call in `VoteService.castVote` / `removeVote` with `scoring.calculate(...)`. The vote service now passes `entry.boostCredits`, `entry.hostPinned`, and `entry.createdAt` into the calculator so future boost (M15) and host-pin (M14) state contributes correctly.
- `loadVotableEntry` in `VoteService` now returns both the entry and the joinable session so the calculator's settings are obtained in the same lookup.

## Changed files

```text
README.md
apps/api/src/app/app.module.ts
apps/api/src/app/modules/proximity/proximity.service.spec.ts
apps/api/src/app/modules/queue/queue-entry.repository.ts
apps/api/src/app/modules/queue/queue.module.ts
apps/api/src/app/modules/queue/queue.service.spec.ts
apps/api/src/app/modules/queue/queue.service.ts
apps/api/src/app/modules/queue/redis-queue.repository.ts
apps/api/src/app/modules/scoring/score-rebuild.module.ts
apps/api/src/app/modules/scoring/score-rebuild.service.spec.ts
apps/api/src/app/modules/scoring/score-rebuild.service.ts
apps/api/src/app/modules/scoring/scoring-dev.controller.spec.ts
apps/api/src/app/modules/scoring/scoring-dev.controller.ts
apps/api/src/app/modules/scoring/scoring.module.ts
apps/api/src/app/modules/scoring/scoring.service.spec.ts
apps/api/src/app/modules/scoring/scoring.service.ts
apps/api/src/app/modules/sessions/session.repository.ts
apps/api/src/app/modules/voting/vote.module.ts
apps/api/src/app/modules/voting/vote.service.spec.ts
apps/api/src/app/modules/voting/vote.service.ts
libs/shared-types/src/sessions.ts
libs/shared-types/src/votes.ts
```

## New APIs

### `POST /api/v1/dev/sessions/:sessionId/recalculate-scores` (non-prod only)

Body: none. Returns `202 Accepted` with:

```json
{
  "data": {
    "sessionId": "uuid",
    "recalculated": 17,
    "pendingInZset": 12
  }
}
```

Returns `403` in production. Useful when the Redis ZSET drifts out of sync with Postgres, or when changing scoring weights mid-session.

Host-driven recalculate / rescoring ships with M14 (Host Controls).

## Database / Redis changes

- **No migration.** The `scoring` block lives in `party_sessions.settings_json` (already `jsonb`). Old rows are coalesced to defaults at the repository read seam. New rows created after this deploy get the full defaults from `SessionService.createSession`.
- Redis bulk-write helper added: `setPendingBulk(sessionId, [{ entryId, score }, ...])`. Single ZADD round-trip.

## Module structure

```text
ScoringModule          → providers: ScoringService           exports: ScoringService
ScoreRebuildModule     → imports: SessionModule, QueueModule, ScoringModule
                         providers: ScoreRebuildService
                         controllers: ScoringDevController
QueueModule.imports   += ScoringModule    (for the initial score in addTrack)
VoteModule.imports    += ScoringModule    (for the post-vote score recompute)
```

This split was deliberate — `ScoringService` is dep-less, so importing it from QueueModule / VoteModule does not create a cycle with the rebuild module that pulls in queue/session.

## Tests added

21 new tests across three files (265/265 in the API suite overall):

- `scoring.service.spec.ts` — zero entry returns 0; upvote raises via `log(1+u)`; downvote linear; boost dominates a downvote; aging is `0.05 * minutes`; aging stacks linearly; host pin dominates `(100 up, 10 boosts, 1h aged)`; per-session weight overrides take effect; missing scoring block defaults; clock-skew negative age clamps to 0.
- `score-rebuild.service.spec.ts` — recalculateEntry happy path + ZADD; LOCKED entry skips ZADD; 404 on unknown; recalculateSession produces strict-descending ZSET order; only PENDING enters the projection; setScore skipped when the recompute is within epsilon; empty session rebuild still DELs.
- `scoring-dev.controller.spec.ts` — 202 in non-prod, 403 in prod, 400 on malformed uuid.

```text
NX_DAEMON=false npx nx build @fairplay/api --skip-nx-cache  ✅
NX_DAEMON=false npx nx test  @fairplay/api --skip-nx-cache  ✅ 265/265 (244 prior + 21 new)
NX_DAEMON=false npx nx lint  @fairplay/api --skip-nx-cache  ✅ (1 pre-existing console warning)
```

## Manual verification

Railway deploy `4b2e9e86-cbdc-4935-a894-55e94df21eba` succeeded; live health all `ok`.

Live smoke (temp host/session/guest/track/entry inserted via SQL, cleaned up afterward). The temp session's `settings_json` was created with **no** `scoring` block so this also exercises the read-side coalesce path.

1. `POST /queue/:id/vote {value:1}` → `entry.score = 1.402408`. Matches `2*log(2) + 0.05*minutesAge ≈ 1.401`. (Was `1` exactly under M08.)
2. Re-cast `{value:1}` → `entry.score = 1.40306`. Score slightly higher because aging contribution grew. (Confirms the formula is being applied on every mutation, not just counter changes.)
3. `DELETE /queue/:id/vote` → `entry.score = 0.017285`. Pure age contribution (`0.05 * 0.345 min ≈ 0.017`).
4. `POST /sessions/:id/queue` with a new track → fresh entry's `score = 0` exactly. Matches M07 invariant: brand-new entry with zero counters/age = zero score.
5. `GET /sessions/:id/queue` → returned ordered list, aged entry (0.017) above brand-new (0). Aging-driven ordering works in prod.
6. `POST /dev/sessions/:id/recalculate-scores` against the prod deploy → `403 Forbidden { "message": "Dev tools are disabled in production." }`. Gate works.

## Known risks / limitations

- The default `hostPinWeight=1000` is large enough that pinned entries will always sit on top, which is the intent. If a host pins many entries at once they tie on `1000 + base`; lexicographic UUID ordering breaks ties in the ZSET. M14 should add a sub-pin-order field if explicit pin ordering is needed.
- `recalculateSession` is a serial loop. For a session with ~hundreds of entries that's still well under a second, but a chunked batch update could replace this if M20 load testing surfaces it.
- The dev endpoint is the *only* manual recompute path. Production scoring relies on the per-mutation hot path in QueueService/VoteService. If a future feature mutates `boostCredits` or `hostPinned` without recomputing the score, the entry will drift in rank. M14 (host pin) and M15 (boost) must call `ScoreRebuildService.recalculateEntry` after they update those fields.
- `SCORE_WRITE_EPSILON = 1e-4` was chosen so aging-only drift inside a single session doesn't churn the DB. If we later move to `ageWeight > 1` per minute, this constant should be revisited.

## Next milestone

Milestone 10 — Lock Window and Free Token Challenge.

M09 enables M10 because:

1. The top-of-queue ZSET now has stable, deterministic scoring — picking the top N for the lock window is a single `ZREVRANGE 0 N-1`.
2. Locked entries still get votes (M08) and score updates (M09), but stay in the ZSET projection until released — M10's release path should call `ScoreRebuildService.recalculateEntry` to re-rank them against fresh entries.
3. The `lockHostPinned` short-circuit pattern is already supported by the scoring formula's `hostPinWeight=1000`.
