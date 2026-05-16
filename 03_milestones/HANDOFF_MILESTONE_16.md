# Handoff — Milestone 16: Moderation and Abuse Protection

## Completed

- Added `apps/api/src/app/modules/moderation/`:
  - `RateLimitService` — Redis token-bucket limiter used for join attempts, search, queue add, voting, and token spend paths. Redis failures fail open and log a warning.
  - `BlacklistService` — host-owned track and artist blacklists with normalized artist matching.
  - `GuestDisciplineService` — host mute/ban/unmute. Mute/ban mark the guest status and remove their `PENDING`/`LOCKED` entries from Postgres plus pending/locked Redis projections.
  - `ModerationService` — central policy checks for guest status, rate limits, explicit filtering, and blacklist enforcement.
  - `ModerationController` — host moderation endpoints.
- Added Supabase migration `20260516041149_m16_moderation_and_abuse_protection.sql`:
  - `session_track_blacklist`.
  - `session_artist_blacklist`.
  - RLS enabled on both tables with deny-anon/authenticated policies.
- Mirrored the migration in `apps/api/prisma/schema.prisma` and regenerated Prisma Client.
- Integrated moderation checks into:
  - join: join-attempt rate limit and banned-device rejoin block when `deviceHash` is present.
  - search/normalize: search rate limit, banned guest block, explicit/blacklist filtering.
  - queue add/list/remove: queue-add rate limit, explicit/blacklist rejection, muted/banned mutation block, banned read block.
  - vote: centralized vote rate limit and muted/banned block.
  - boost/challenge: token-spend rate limit and muted/banned block.

## New APIs

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| POST | `/api/v1/sessions/:sessionId/blacklist/track` | Host JWT | Adds/updates a session track blacklist entry |
| POST | `/api/v1/sessions/:sessionId/blacklist/artist` | Host JWT | Adds/updates a normalized artist blacklist entry |
| POST | `/api/v1/sessions/:sessionId/guests/:guestId/mute` | Host JWT | Sets guest `MUTED` and removes their pending/locked entries |
| POST | `/api/v1/sessions/:sessionId/guests/:guestId/ban` | Host JWT | Sets guest `BANNED`, removes pending/locked entries, blocks device rejoin |
| DELETE | `/api/v1/sessions/:sessionId/guests/:guestId/mute` | Host JWT | Restores muted guest to `ACTIVE` |

Track blacklist body:

```json
{ "spotifyTrackId": "abc123", "title": "Blocked song" }
```

or:

```json
{ "spotifyUri": "spotify:track:abc123" }
```

Artist blacklist body:

```json
{ "artistName": "Blocked Artist" }
```

## Changed behavior

- Muted guests can still hold a token and be present in the session, but cannot add/remove queue entries, vote, boost, or challenge.
- Banned guests cannot search, list queue, add/remove queue entries, vote, boost, or challenge.
- If a banned guest rejoins with the same `deviceHash`, join is rejected before a new guest row or wallet can be created.
- Blacklisted tracks/artists are rejected on queue add and filtered out of search results.
- Existing explicit filtering now runs through `ModerationService.assertTrackAllowed`.

## Changed files

```text
README.md
apps/api/prisma/schema.prisma
apps/api/src/app/app.module.ts
apps/api/src/app/modules/moderation/
apps/api/src/app/modules/guests/guest.module.ts
apps/api/src/app/modules/guests/guest.repository.ts
apps/api/src/app/modules/guests/guest.service.ts
apps/api/src/app/modules/queue/queue.controller.ts
apps/api/src/app/modules/queue/queue.module.ts
apps/api/src/app/modules/queue/queue.service.ts
apps/api/src/app/modules/tracks/track-search.service.ts
apps/api/src/app/modules/tracks/track.module.ts
apps/api/src/app/modules/voting/vote.service.ts
apps/api/src/app/modules/voting/vote.module.ts
apps/api/src/app/modules/tokens/boost.service.ts
apps/api/src/app/modules/tokens/token.module.ts
apps/api/src/app/modules/lock-window/challenge.service.ts
apps/api/src/app/modules/lock-window/lock-window.module.ts
supabase/migrations/20260516041149_m16_moderation_and_abuse_protection.sql
```

## Tests added

- `rate-limit.service.spec.ts` — token bucket allow/deny/fail-open behavior.
- `blacklist.service.spec.ts` — host ownership, track blacklist, artist blacklist, artist normalization.
- `guest-discipline.service.spec.ts` — mute/ban authorization, queue entry removal, Redis cleanup, banned unmute rejection.
- `moderation.service.spec.ts` — muted/banned blocks, join rate limit, explicit rejection, search-result filtering.
- `moderation.controller.spec.ts` — host auth, DTO validation, and endpoint routing.
- Existing guest, queue, track, vote, boost, challenge, queue-controller, and score-rebuild specs updated for the new moderation gates.

Verification:

```text
npm run prisma:generate                         ✅
npm --workspace libs/shared-types run build     ✅
npm --workspace apps/api run build              ✅
npm --workspace apps/api test                   ✅ 428/428
npm --workspace apps/api run lint               ✅ 0 errors, 1 pre-existing main.ts console warning
psql migration dry-run in transaction + rollback ✅
```

## Manual verification

Unauthenticated local route smoke:

```bash
curl -i -X POST http://localhost:3000/api/v1/sessions/11111111-1111-1111-1111-111111111111/blacklist/track \
  -H 'content-type: application/json' \
  -d '{"spotifyTrackId":"abc123"}'

curl -i -X POST http://localhost:3000/api/v1/sessions/11111111-1111-1111-1111-111111111111/guests/22222222-2222-2222-2222-222222222222/mute
```

Expected: `401` without a host token.

Full local flow with real host/guest JWTs:

1. Host creates a session; guest joins with a stable `deviceHash`.
2. Guest adds a track, then host calls `POST /sessions/:sessionId/guests/:guestId/mute`.
3. `GET /sessions/:sessionId/queue` no longer shows the guest's pending/locked entries.
4. Same guest tries queue add, vote, boost, or challenge: each returns `403`.
5. Host calls `DELETE /sessions/:sessionId/guests/:guestId/mute`; guest can mutate queue again.
6. Host blacklists a track or artist; future queue adds for that track/artist return `403`.
7. Host bans the guest; same guest/device cannot mutate queue and cannot rejoin with the same `deviceHash`.

## Known limitations

- Ban persistence across rejoin depends on clients sending a stable `deviceHash`. Without one, the backend cannot reliably connect a fresh public join request to a previous banned guest.
- Mute/ban removes only `PENDING` and `LOCKED` entries. Tracks already queued to Spotify or currently playing are not forcibly removed from Spotify's queue.
- Rate limits are intentionally conservative MVP defaults and are not yet host-configurable.
- No persistent audit-log table was added; security-relevant moderation actions are logged. The `audit_logs` table remains better suited to M18 observability.

## Next milestone

Milestone 17 — Frontend MVP.

The frontend can now expose:

1. Host moderation controls for track/artist blacklist and guest mute/ban.
2. Guest-facing blocked/rate-limited error states.
3. Session settings UI that includes explicit filtering, duplicate cooldown, and max suggestions.
