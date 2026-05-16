# Handoff — Milestone 07: Internal Queue

## Completed

- Added `apps/api/src/app/modules/queue/`:
  - `QueueEntryRepository` — Prisma access to `public.queue_entries`. Helpers for `create`, `findById`, `findByIdWithTrack`, `listBySessionWithTrack`, `countActiveByGuest`, `findRecentForTrack` (cooldown probe), and `markRemoved`.
  - `RedisQueueRepository` — owns the `party:{sessionId}:pending` ZSET. `addPending`, `removeEntry`, `listPendingIds`. All Redis errors are logged and swallowed so the DB write remains the source of truth (per `SYSTEM_PATTERNS` rule 7).
  - `QueueService` — orchestrates `addTrack`, `listSession`, `removeOwnEntry`. Re-normalizes the guest-submitted Spotify payload server-side, upserts the durable `tracks` row, enforces `maxSuggestionsPerGuest` and `duplicateCooldownSeconds`, computes the initial score (M07 = 0), creates the queue row, and pushes it to the Redis ZSET. Emits structured logs at success and rejection paths.
  - `QueueController` — three endpoints (see below), all guarded by `GuestAuthGuard` and scoped by the `sid` claim.
- Added shared `QueueEntryDto` / `QueueEntryStatus` to `@fairplay/shared-types`.
- Added Prisma `QueueEntry` model with indexes `(session_id, status)`, `(session_id, score desc)`, `(session_id, track_id)`, `(added_by_guest_id)`.
- Applied Supabase migration `20260515184447_m07_internal_queue.sql` to project `zgublzgoejdzexwpicvb`. Table created with RLS enabled, `deny_anon_queue_entries` policy for `anon`/`authenticated`, status check constraint, and the shared `set_updated_at` trigger.

## Changed files

```text
README.md
apps/api/prisma/schema.prisma
apps/api/src/app/app.module.ts
apps/api/src/app/modules/queue/dto/add-queue-entry.dto.ts
apps/api/src/app/modules/queue/queue-entry.repository.ts
apps/api/src/app/modules/queue/queue.controller.spec.ts
apps/api/src/app/modules/queue/queue.controller.ts
apps/api/src/app/modules/queue/queue.module.ts
apps/api/src/app/modules/queue/queue.service.spec.ts
apps/api/src/app/modules/queue/queue.service.ts
apps/api/src/app/modules/queue/redis-queue.repository.spec.ts
apps/api/src/app/modules/queue/redis-queue.repository.ts
libs/shared-types/src/index.ts
libs/shared-types/src/queue.ts
supabase/migrations/20260515184447_m07_internal_queue.sql
```

## New APIs

All three require a guest JWT (the M04 `Bearer` token). The JWT's `sid` claim must match `:sessionId` in routes that carry one.

### `POST /api/v1/sessions/:sessionId/queue`

Body — same shape as `POST /tracks/normalize`, the raw Spotify-search payload:

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

Server-side flow:

1. Verify guest JWT and session scope.
2. `SessionService.loadJoinable` (must be ACTIVE, not expired).
3. Re-normalize the payload (`TrackNormalizer`); reject `is_local`/malformed.
4. Reject explicit if `settings.allowExplicitTracks=false`.
5. Upsert `tracks` via `TrackRepository`.
6. Enforce `settings.maxSuggestionsPerGuest` (`PENDING`/`LOCKED`/`QUEUED_TO_SPOTIFY`/`PLAYING` count against the guest budget).
7. Enforce `settings.duplicateCooldownSeconds` — any active entry for this track blocks; a `PLAYED` entry blocks until `played_at` is older than the cooldown.
8. Create `queue_entries` row with `status=PENDING`, `score=0`.
9. `ZADD party:{sessionId}:pending 0 <entryId>`.
10. Return the `QueueEntryDto` (201).

Status codes: 201 created, 400 validation, 401 missing/expired token, 403 wrong session, 409 cooldown or per-guest cap, 410 session ended/expired.

### `GET /api/v1/sessions/:sessionId/queue`

Returns the session's queue entries ordered by `score desc, createdAt asc`, excluding `REMOVED` and `VETOED`. Authorization: guest JWT for that session.

### `DELETE /api/v1/queue/:entryId`

M07 scope is intentionally narrow: the **adder** can retract their own entry while it is still `PENDING`. Host moderation (`VETOED`, force removal of locked/playing rows) is a Milestone 14 concern.

- 200 with the updated `QueueEntryDto` (status=`REMOVED`).
- 403 if the JWT subject does not match `added_by_guest_id`.
- 404 unknown entry.
- 409 entry is no longer `PENDING`.

## Database changes

Migration `supabase/migrations/20260515184447_m07_internal_queue.sql`:

```sql
create table public.queue_entries (
    id                   uuid primary key default uuid_generate_v4(),
    session_id           uuid not null references public.party_sessions(id) on delete cascade,
    track_id             uuid not null references public.tracks(id) on delete restrict,
    added_by_guest_id    uuid references public.session_guests(id) on delete set null,
    status               text not null default 'PENDING'
                         check (status in ('PENDING','LOCKED','QUEUED_TO_SPOTIFY','PLAYING','PLAYED','REMOVED','VETOED')),
    upvotes              int not null default 0 check (upvotes >= 0),
    downvotes            int not null default 0 check (downvotes >= 0),
    boost_credits        int not null default 0 check (boost_credits >= 0),
    score                numeric not null default 0,
    locked_until         timestamptz,
    host_pinned          boolean not null default false,
    spotify_queued_at    timestamptz,
    playing_at           timestamptz,
    played_at            timestamptz,
    removed_at           timestamptz,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);
```

Indexes: `(session_id, status)`, `(session_id, score desc)`, `(session_id, track_id)`, `(added_by_guest_id)`.

RLS enabled with `deny_anon_queue_entries` (anon + authenticated). Backend service-role connection bypasses RLS as before. `set_updated_at` trigger keeps `updated_at` fresh.

## Redis keys

- `party:{sessionId}:pending` — ZSET projection of pending entries. Member = `queueEntryId`, score = entry's `score`. Best-effort writes; failures are logged. Rebuildable from Postgres (M-future maintenance script).

## Events emitted

None. M07 deliberately writes only the durable row + the ZSET; M11 wires WebSocket fanout for queue updates.

## Tests added

Unit (no DB, no Redis required):

- `queue.service.spec.ts` — happy path (DB write + ZSET push), unnormalizable track rejection, explicit filter, per-guest cap, duplicate cooldown rejection, cooldown cutoff math, ended-session refusal, list ordering, removal happy path, 404 on unknown entry, FORBIDDEN on cross-guest removal, CONFLICT when entry is no longer pending.
- `redis-queue.repository.spec.ts` — ZADD key/score arguments, ZREM, ZREVRANGE list, swallow ZADD errors.
- `queue.controller.spec.ts` — JWT presence, cross-session rejection, body validation, happy paths, DELETE uuid validation, ZREMOVE.

```text
NX_DAEMON=false npx nx build @fairplay/api --skip-nx-cache  ✅
NX_DAEMON=false npx nx test @fairplay/api  --skip-nx-cache   ✅ 215/215 (189 prior + 26 new)
NX_DAEMON=false npx nx lint @fairplay/api  --skip-nx-cache   ✅ (1 pre-existing console warning in main.ts)
```

## Manual verification

Build and lint pass locally. Migration applied to Supabase project `zgublzgoejdzexwpicvb`; security advisors clean.

Railway deploy `62878c20-9f9d-4e58-ac04-cc561588061a` succeeded; live `/health`, `/health/db`, `/health/redis` all `ok`.

Recorded live smoke against the new deploy (temp host + session + guest inserted via SQL, guest JWT minted with the shared `HOST_JWT_SECRET`, then deleted afterward):

1. `POST /sessions/:id/queue` with a synthetic Spotify-like track → `201`, returned `QueueEntryDto` with `status=PENDING`, `score=0`, `track.spotifyTrackId=M07SMOKETRACK01`.
2. Re-POST same track → `409 CONFLICT` with `details.existingEntryId`, `details.existingStatus="PENDING"`, `details.cooldownSeconds=900`.
3. `GET /sessions/:id/queue` → `1` entry returned.
4. `DELETE /queue/:entryId` → `200`, `status=REMOVED`.
5. `GET /sessions/:id/queue` after removal → `0` entries (REMOVED is excluded).

To verify live with a real Spotify-connected host:

```bash
API=https://api-production-7ee5.up.railway.app/api/v1

# 1. Add to queue (guest JWT from M04 join flow)
curl -s -X POST -H "Authorization: Bearer $GUEST_JWT" \
  -H "Content-Type: application/json" \
  "$API/sessions/$SESSION_ID/queue" \
  -d '{ "id":"abc123","uri":"spotify:track:abc123","name":"Song",
        "artists":[{"name":"Artist"}],"duration_ms":180000,"explicit":false }' | jq

# 2. List queue
curl -s -H "Authorization: Bearer $GUEST_JWT" \
  "$API/sessions/$SESSION_ID/queue" | jq '.data | length'

# 3. Retract own entry
curl -s -X DELETE -H "Authorization: Bearer $GUEST_JWT" \
  "$API/queue/$ENTRY_ID" | jq '.data.status'   # → "REMOVED"
```

## Known risks / limitations

- Initial score is hardcoded to `0`; once M09 (Scoring Engine) ships, the queue service should call `ScoringService.calculate(entry, settings)` and the ZSET ZADD should use that value. Search for `INITIAL_SCORE` in `queue.service.ts`.
- DB write and Redis ZADD are not atomic. ZADD failures are logged and the DB row remains authoritative; an M-future maintenance task should rebuild the ZSET from Postgres.
- DELETE is intentionally limited to the adder's own `PENDING` entry. Host force-removal lands with M14 (Host Controls); vote-driven veto lands with M16 (Moderation).
- No WebSocket fanout yet — clients must poll `GET /queue` until M11.
- The duplicate-cooldown lookup considers `PLAYED` rows; rows that somehow reach `PLAYED` without `played_at` fall back to `updatedAt`.

## Next milestone

Milestone 08 — Voting System.

M07 enables M08 because vote mutations target a stable `queue_entries.id`. Voting must:

1. Bump `upvotes`/`downvotes` on a row that exists here.
2. Call the future `ScoringService` (M09) to recompute `score`.
3. Update the same `party:{sessionId}:pending` ZSET this milestone introduced.
