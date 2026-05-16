# Handoff — Milestone 08: Voting System

## Completed

- Added `apps/api/src/app/modules/voting/`:
  - `VoteRepository` — `findForEntryGuest`, `upsert`, `delete` against `public.votes`. All methods accept an optional `PrismaTxn` so they can run inside a transaction with the queue-counter update.
  - `VoteRateLimiter` — Redis fixed-window per-guest cap (12 actions / 10s). Fails open on Redis errors so a Redis outage doesn't deny voting.
  - `VoteService` — orchestrates: rate-limit check → load + scope-check entry → `prisma.$transaction(...)` performs the vote upsert/delete and the `queue_entries` counter+score delta atomically → if entry is `PENDING`, refresh the `party:{sessionId}:pending` ZSET with the new score.
  - `VoteController` — `POST /api/v1/queue/:entryId/vote` and `DELETE /api/v1/queue/:entryId/vote`, both guarded by `GuestAuthGuard` and scoped via the JWT `sid`.
- Extended `QueueEntryRepository` with `findByIdForUpdate` and `applyVoteDelta` (atomic `increment` + `score`), both txn-aware.
- Added shared types: `VoteDto`, `VoteValue`, and `computeInterimScore` (the M07/M08 interim score; M09 will replace this everywhere).
- Added Prisma `Vote` model with composite unique `(entry_id, guest_id)`.
- Introduced `apps/api/src/app/modules/database/prisma-txn.ts` — a shared `PrismaTxn` type so repositories can run inside or outside a transaction without a circular import.

## Changed files

```text
README.md
apps/api/prisma/schema.prisma
apps/api/src/app/app.module.ts
apps/api/src/app/modules/database/prisma-txn.ts
apps/api/src/app/modules/queue/queue-entry.repository.ts
apps/api/src/app/modules/voting/dto/cast-vote.dto.ts
apps/api/src/app/modules/voting/vote-rate-limiter.spec.ts
apps/api/src/app/modules/voting/vote-rate-limiter.ts
apps/api/src/app/modules/voting/vote.controller.spec.ts
apps/api/src/app/modules/voting/vote.controller.ts
apps/api/src/app/modules/voting/vote.module.ts
apps/api/src/app/modules/voting/vote.repository.ts
apps/api/src/app/modules/voting/vote.service.spec.ts
apps/api/src/app/modules/voting/vote.service.ts
libs/shared-types/src/index.ts
libs/shared-types/src/votes.ts
supabase/migrations/20260515190443_m08_voting_system.sql
```

## New APIs

Both require a guest JWT. The JWT's `sid` claim must match the queue entry's `session_id` (enforced inside `VoteService.loadVotableEntry`, not in the URL).

### `POST /api/v1/queue/:entryId/vote`

Body:

```json
{ "value": 1 }    // or -1
```

Response (200):

```json
{
  "data": {
    "vote": {
      "id": "uuid",
      "entryId": "uuid",
      "guestId": "uuid",
      "value": 1,
      "createdAt": "...",
      "updatedAt": "..."
    },
    "entry": {
      "id": "uuid",
      "upvotes": 3,
      "downvotes": 1,
      "score": 2,
      "status": "PENDING"
    }
  }
}
```

Re-casting the same value is idempotent. Switching from +1 to -1 (or vice versa) updates the row in place and applies a -2 swing to the score.

### `DELETE /api/v1/queue/:entryId/vote`

Removes this guest's vote (if any). Response shape identical to the cast endpoint, but `vote` is `null`.

### Status codes

| Code | When |
| --- | --- |
| 200 | success (cast or remove) |
| 400 | value not ±1 or entryId not a UUID |
| 401 | missing/invalid guest JWT |
| 403 | guest JWT scoped to a different session than the entry |
| 404 | unknown entry |
| 409 | entry status is PLAYED, REMOVED, or VETOED |
| 410 | session is no longer joinable (ENDED/EXPIRED) |
| 429 | rate limiter tripped (12 vote actions / 10s per guest) |

## Database changes

Migration `supabase/migrations/20260515190443_m08_voting_system.sql`:

```sql
create table public.votes (
    id          uuid primary key default uuid_generate_v4(),
    entry_id    uuid not null references public.queue_entries(id) on delete cascade,
    guest_id    uuid not null references public.session_guests(id) on delete cascade,
    value       int  not null check (value in (-1, 1)),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (entry_id, guest_id)
);
```

Indexes: `(entry_id)`, `(guest_id)`. RLS enabled with `deny_anon_votes`. `set_updated_at` trigger keeps `updated_at` fresh on upsert.

**Counter authority:** `votes` is the durable proof-of-vote table; `queue_entries.upvotes/downvotes/score` are denormalized aggregates updated in the same transaction. Postgres remains the source of truth for both. The Redis ZSET (`party:{sessionId}:pending`) is a rebuildable projection.

## Redis keys

- `rl:vote:{guestId}` — fixed-window vote rate-limit counter; TTL 10s.
- `party:{sessionId}:pending` — already owned by M07; `VoteService` ZADDs the new score on every successful vote for a `PENDING` entry.

## Lock-window semantics

`LOCKED` / `QUEUED_TO_SPOTIFY` / `PLAYING` entries **accept votes** (counters and score update in Postgres), but the ZSET is **not** updated — the entry can't get displaced from its current rank until M10's lock window owns the unfreeze path. `PLAYED` / `REMOVED` / `VETOED` reject votes with `409 CONFLICT`.

## Tests added

29 unit tests across three files:

- `vote.service.spec.ts` — `computeDeltas` math (zero→+1, zero→−1, +1→−1, +1→null, −1→null, +1→+1 no-op); cast happy paths for upvote/downvote; flipping; re-casting; LOCKED entries skip ZSET; PLAYED rejected; cross-session forbidden; 404 unknown; rate-limiter trips before DB load; remove no-op when no vote; remove strips counter + ZSET; rate-limit on removal.
- `vote-rate-limiter.spec.ts` — first action sets TTL, follow-ups don't reset it, over-cap throws RATE_LIMITED with `retryAfterSec`, Redis outage fails open.
- `vote.controller.spec.ts` — 401/400 entry-uuid/400 value-bound/happy POST + DELETE.

```text
NX_DAEMON=false npx nx build @fairplay/api --skip-nx-cache  ✅
NX_DAEMON=false npx nx test  @fairplay/api --skip-nx-cache  ✅ 244/244 (215 prior + 29 new)
NX_DAEMON=false npx nx lint  @fairplay/api --skip-nx-cache  ✅ (1 pre-existing console warning)
```

## Manual verification

Migration applied to Supabase project `zgublzgoejdzexwpicvb`; security advisors clean. Railway deploy `6761c7fa-df3c-4409-87fe-f0fa4d08ed24` succeeded; live health/db/redis all `ok`.

Recorded live smoke against the new deploy (temp host/session/guest/track/queue_entries rows inserted via SQL, guest JWT minted with the shared `HOST_JWT_SECRET`, all rows deleted afterward):

1. `POST /queue/:entryId/vote {value:1}` → `200`, `entry={upvotes:1, downvotes:0, score:1}`.
2. Re-POST `{value:1}` → `200`, `entry` unchanged (idempotent).
3. POST `{value:-1}` (flip) → `200`, `entry={upvotes:0, downvotes:1, score:-1}`.
4. POST `{value:7}` → `400 VALIDATION_FAILED`.
5. `DELETE /queue/:entryId/vote` → `200`, `vote:null`, `entry={upvotes:0, downvotes:0, score:0}`.
6. Burst of 13 rapid POSTs → first 8 returned 200, remaining 5 returned 429 (the prior 5 calls in steps 1–5 had already consumed window credits, confirming the 12-action / 10s cap).

To verify live (after deploy):

```bash
API=https://api-production-7ee5.up.railway.app/api/v1

# Upvote
curl -s -X POST -H "Authorization: Bearer $GUEST_JWT" -H "Content-Type: application/json" \
  "$API/queue/$ENTRY_ID/vote" -d '{"value":1}' | jq

# Flip to downvote (same guest, same entry)
curl -s -X POST -H "Authorization: Bearer $GUEST_JWT" -H "Content-Type: application/json" \
  "$API/queue/$ENTRY_ID/vote" -d '{"value":-1}' | jq '.data.entry'

# Remove vote
curl -s -X DELETE -H "Authorization: Bearer $GUEST_JWT" "$API/queue/$ENTRY_ID/vote" | jq

# Rate limit (>12 actions / 10s)
for i in {1..13}; do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "Authorization: Bearer $GUEST_JWT" \
    -H "Content-Type: application/json" \
    "$API/queue/$ENTRY_ID/vote" -d '{"value":1}'
done
# Expect: 13th returns 429
```

## Known risks / limitations

- Scoring is still the interim `upvotes - downvotes` formula. When M09 lands, `VoteService.castVote/removeVote` should call `ScoringService.calculate(entry, settings)` after the counters are updated. The single place to change is the `computeInterimScore(...)` call inside `vote.service.ts`.
- Rate limit is intentionally generous (12/10s). Tune in `vote-rate-limiter.ts` if abuse appears.
- The ZSET update is best-effort and outside the DB transaction. A crash between the txn commit and the ZADD leaves the projection stale; a future maintenance command (see SYSTEM_PATTERNS rule 7) should rebuild from Postgres.
- `LOCKED`/`QUEUED_TO_SPOTIFY`/`PLAYING` entries accept votes but their ZSET rank is intentionally frozen. M10 (Lock Window) owns the unfreeze and any re-evaluation logic.
- The vote→score recompute path will need to be re-entered by M14 (host pin) and M15 (boost tokens). Those milestones should call into the same `applyVoteDelta`-style atomic update rather than rolling their own.

## Next milestone

Milestone 09 — Scoring Engine.

M08 enables M09 because all the mutation entry points that need a real score (`QueueService.addTrack`, `VoteService.castVote`, `VoteService.removeVote`) now exist and share a common, single-line scoring call site. M09 should:

1. Add `ScoringModule` + `ScoringService` with the full formula (`upvoteWeight * log(1+upvotes) - downvoteWeight*downvotes + boostWeight*boostCredits + ageWeight*minutesWaiting + hostPinWeight*hostPinned`).
2. Replace every `computeInterimScore(...)` call with `scoringService.calculate(entry, sessionSettings)`.
3. Add `ScoreRebuildService.rebuildSession(sessionId)` to recompute all entries and rebuild the ZSET in one pass.
