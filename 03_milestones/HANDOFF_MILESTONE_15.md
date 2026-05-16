# Handoff — Milestone 15: Session Token Economy

## Completed

- Added `apps/api/src/app/modules/tokens/`:
  - `TokenLedgerService` — writes durable token grant/spend audit rows and exposes an entry-spend lookup used for boost idempotency.
  - `GuestWalletService` — `GET /guests/me/wallet` and host token grants. Host grants verify session ownership with `SessionService.getSession`, verify the guest belongs to the session, increment wallet balances transactionally, write `HOST_GRANT` ledger rows, and publish `token.updated`.
  - `BoostService` — `POST /queue/:entryId/apply-boost`. Validates guest/session scope, accepts only `PENDING` or `LOCKED` entries, spends one boost token, writes a `BOOST_SPEND` ledger row, increments `queue_entries.boost_credits`, recalculates score with M09 `ScoringService`, refreshes the Redis pending ZSET for pending entries, and publishes `queue.updated` + `token.updated`.
  - Controllers for wallet read, boost apply, and host grants.
- Added Supabase migration `20260516010000_m15_session_token_economy.sql`:
  - `token_ledger` with `BOOST | CHALLENGE` token type checks.
  - Positive grant / negative spend direction checks.
  - Reasons: `JOIN_GRANT`, `HOST_GRANT`, `BOOST_SPEND`, `CHALLENGE_LOCK`.
  - Unique guard on `(session_id, guest_id, entry_id, token_type, reason)` so per-entry spends are naturally idempotent.
  - RLS enabled with deny-anon/authenticated policy.
- Mirrored the migration in `apps/api/prisma/schema.prisma` and regenerated Prisma Client.
- Extended existing token paths:
  - `GuestWalletRepository.create` now writes `JOIN_GRANT` ledger rows with the initial wallet.
  - `GuestWalletRepository.spendBoostToken` and `grantTokens` added.
  - `ChallengeService.challengeLock` now writes a `CHALLENGE_LOCK` ledger row inside the existing spend/unlock transaction.
  - `QueueEntryRepository.incrementBoostCredits` added for M15 boost spends.
- Extended shared realtime types:
  - `QueueUpdatedPayload.reason += 'boost_applied'`.
  - `TokenUpdatedPayload.reason += 'boost_applied' | 'host_grant'`.
  - `TokenUpdatedPayload.tokenType += 'WALLET'` for grants that change both balances.

## New / changed endpoints

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| GET | `/api/v1/guests/me/wallet` | Guest JWT | returns caller wallet `{ guestId, sessionId, boostTokens, challengeTokens }` |
| POST | `/api/v1/queue/:entryId/apply-boost` | Guest JWT | spends one BOOST token once per guest/entry, increments `boostCredits`, recalculates score |
| POST | `/api/v1/queue/:entryId/challenge-lock` | Guest JWT | unchanged public surface; now records `CHALLENGE_LOCK` in `token_ledger` |
| POST | `/api/v1/sessions/:sessionId/guests/:guestId/grant-tokens` | Host JWT | grants free BOOST/CHALLENGE tokens and records `HOST_GRANT` rows |

Host grant body:

```json
{ "boostTokens": 2, "challengeTokens": 1 }
```

At least one value must be greater than zero. Upper bounds match session settings: boost `0..50`, challenge `0..20`.

## Status codes

| Code | When |
| --- | --- |
| 200 | success on wallet, boost, challenge, and grant endpoints |
| 400 | malformed UUID or invalid grant body |
| 401 | missing/invalid guest or host JWT |
| 403 | guest JWT scoped to another session, or host does not own the target session |
| 404 | unknown wallet, entry, session, or guest not in the session |
| 409 | insufficient token balance, or boost/challenge on an invalid entry status |

## Changed files

```text
README.md
apps/api/prisma/schema.prisma
apps/api/src/app/app.module.ts
apps/api/src/app/modules/guests/guest-wallet.repository.spec.ts
apps/api/src/app/modules/guests/guest-wallet.repository.ts
apps/api/src/app/modules/lock-window/challenge.service.spec.ts
apps/api/src/app/modules/lock-window/challenge.service.ts
apps/api/src/app/modules/lock-window/lock-window.module.ts
apps/api/src/app/modules/queue/queue-entry.repository.ts
apps/api/src/app/modules/tokens/boost.service.spec.ts
apps/api/src/app/modules/tokens/boost.service.ts
apps/api/src/app/modules/tokens/dto/grant-tokens.dto.ts
apps/api/src/app/modules/tokens/guest-wallet.service.spec.ts
apps/api/src/app/modules/tokens/guest-wallet.service.ts
apps/api/src/app/modules/tokens/token-ledger.service.ts
apps/api/src/app/modules/tokens/token.controller.spec.ts
apps/api/src/app/modules/tokens/token.controller.ts
apps/api/src/app/modules/tokens/token.module.ts
libs/shared-types/src/realtime.ts
supabase/migrations/20260516010000_m15_session_token_economy.sql
```

## Database / Redis changes

- New table: `public.token_ledger`.
- Existing table writes:
  - `guest_wallets.boost_tokens`, `guest_wallets.challenge_tokens`.
  - `queue_entries.boost_credits`, `queue_entries.score`.
- Redis:
  - Boost refreshes `party:{sessionId}:pending` only when the boosted entry is still `PENDING`.
  - No new Redis keys.

## Realtime events fired by M15

- `queue.updated` with `reason='boost_applied'` after a non-idempotent boost.
- `token.updated` with `reason='boost_applied'` after a boost spend.
- `token.updated` with `reason='host_grant'` after a host grant.
- Existing challenge `token.updated{reason:'challenge_lock'}` remains unchanged.

## Tests added

21 new API tests (407 total):

- `boost.service.spec.ts` (5) — happy path spend + ledger + score + Redis + realtime; idempotent existing ledger row; insufficient boost token; cross-session forbidden; invalid status rejected.
- `guest-wallet.service.spec.ts` (5) — wallet read; cross-session wallet read forbidden; host grant happy path + two ledger rows + realtime; empty grant rejected; guest outside session rejected.
- `token.controller.spec.ts` (8) — wallet 401/happy; boost 401/400/happy; host grant 401/400/happy.
- `guest-wallet.repository.spec.ts` (3) — join creates `JOIN_GRANT` rows; zero-token wallet skips ledger rows; boost spend uses atomic `updateMany` guard.
- Existing `challenge.service.spec.ts` updated to assert `CHALLENGE_LOCK` ledger writes and no ledger write on insufficient balance.

Verification:

```text
npm --workspace libs/shared-types run build     ✅
npm run prisma:generate                         ✅
npm --workspace apps/api run build              ✅
npm --workspace apps/api test                   ✅ 407/407
npm --workspace apps/api run lint               ✅ 0 errors, 1 pre-existing main.ts console warning
```

## Manual verification

Local unauthenticated route smoke:

```bash
curl -i http://localhost:3000/api/v1/guests/me/wallet
curl -i -X POST http://localhost:3000/api/v1/queue/11111111-1111-1111-1111-111111111111/apply-boost
curl -i -X POST http://localhost:3000/api/v1/sessions/11111111-1111-1111-1111-111111111111/guests/22222222-2222-2222-2222-222222222222/grant-tokens \
  -H 'content-type: application/json' \
  -d '{"boostTokens":1}'
```

Expected: all three return `401` without auth.

Full local E2E with real host/guest JWTs:

1. Create a session and join as a guest.
2. `GET /guests/me/wallet` with the guest JWT returns initial settings-derived balances.
3. Add a queue entry.
4. `POST /queue/:entryId/apply-boost` with the guest JWT decrements `boostTokens`, increments `boostCredits`, increases score by the configured `boostWeight`, emits `queue.updated{reason:boost_applied}`, and emits `token.updated{reason:boost_applied}` to the guest room.
5. Repeat the same boost call: response is idempotent and does not decrement the wallet again.
6. Lock an entry and `POST /queue/:entryId/challenge-lock`: challenge token decrements and a `CHALLENGE_LOCK` ledger row is written.
7. `POST /sessions/:sessionId/guests/:guestId/grant-tokens` with the host JWT and `{ "boostTokens": 2, "challengeTokens": 1 }`: wallet increments, two `HOST_GRANT` ledger rows are written, and `token.updated{reason:host_grant}` fires.

## Known risks / limitations

- **No external idempotency key.** Boost idempotency is natural per `(guest, entry, token type, reason)`, not request-key based. A guest can boost a given entry once; a future product rule for multiple boosts per entry would need an idempotency-key column or a separate `boosts` table.
- **Challenge idempotency is no-double-spend, not same-response replay.** A repeated challenge after the first unlock sees the entry as `PENDING` and returns a status conflict, but it does not spend again.
- **Prisma cannot express the DB check constraints.** The migration owns token type/reason/amount checks. Prisma mirrors columns and the uniqueness guard for typed access.
- **Host grants are intentionally repeatable.** There is no idempotency key for grants because repeated host grants are valid moderator actions.
- **Not deployed yet.** The Supabase migration and Railway deploy still need to be applied before the production API can serve M15.

## Deployment

Not deployed in this pass.

Deployment order when ready:

1. Apply `supabase/migrations/20260516010000_m15_session_token_economy.sql` to Supabase.
2. Deploy the API to Railway.
3. Smoke unauthenticated `401` for the three new endpoints.
4. Run a real guest flow to confirm `token_ledger` rows for `JOIN_GRANT`, `BOOST_SPEND`, `CHALLENGE_LOCK`, and `HOST_GRANT`.

## Next milestone

Milestone 16 — Moderation and Abuse Protection.

M15 creates the abuse surface M16 is meant to protect:

1. Boost spend rate limiting.
2. Host moderation/audit views over guests and token activity.
3. Abuse-safe handling for repeated joins, token farming, and malicious queue actions.
