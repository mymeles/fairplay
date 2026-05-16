# Handoff — Milestone 11: Real-Time WebSockets

## Completed

- Added `apps/api/src/app/modules/realtime/`:
  - `PartyGateway` — Socket.IO gateway on namespace `/party`.
  - `RealtimeEventPublisher` — creates standard realtime envelopes, maintains per-session sequence numbers, and broadcasts through the gateway.
  - `realtime-rooms.ts` — canonical room names for `party:{sessionId}`, `host:{sessionId}`, and `guest:{guestId}`.
  - `RealtimeModule` — exports the publisher for queue/vote/lock-window services.
- Added shared realtime contract in `@fairplay/shared-types`:
  - `RealtimeEventType`
  - `RealtimeEventEnvelope<TPayload>`
  - `QueueUpdatedPayload`
  - `VoteUpdatedPayload`
  - `TrackLockPayload`
  - `TokenUpdatedPayload`
- Added Socket.IO/Nest websocket dependencies:
  - `@nestjs/websockets`
  - `@nestjs/platform-socket.io`
  - `socket.io`
- Added shared CORS origin helper for HTTP and Socket.IO:
  - Local dev origins remain allowed: `http://localhost:*`, `http://127.0.0.1:*`.
  - The configured `WEB_AUTH_COMPLETE_URL` origin is also allowed, so the real web app origin can connect without a code change.

## Gateway behavior

Client connect:

```ts
io('https://api-production-7ee5.up.railway.app/party', {
  auth: { token: '<guest-or-host-jwt>' },
});
```

Guest JWT:

- Verified with `GuestJwtService`.
- Automatically joins `party:{sessionId}` and `guest:{guestId}`.
- Receives `realtime.ready` with role, sessionId, and joined rooms.
- Cannot request arbitrary rooms.

Host JWT:

- Verified with `HostJwtService`.
- Connects without joining a session room.
- Must emit `host.join_session` with `{ sessionId }`.
- `PartyGateway` calls `SessionService.getSession(sessionId, hostUserId)` before joining `host:{sessionId}`.

Rejected clients receive `realtime.error` and are disconnected.

## Event envelope

Every published event has this shape:

```json
{
  "type": "queue.updated",
  "sessionId": "session-uuid",
  "sequence": 1,
  "emittedAt": "2026-05-15T23:00:00.000Z",
  "payload": {}
}
```

Sequence numbers are monotonic per API process and per session. Clients can store the highest seen `sequence` for a session and ignore duplicates or older events after reconnect.

## Events wired in M11

- `queue.updated`
  - Queue add: `reason=entry_added`
  - Queue remove: `reason=entry_removed`
  - Vote score change: `reason=score_changed`
  - Lock/unlock/challenge: `reason=lock_changed`
  - Host veto: `reason=entry_vetoed`
- `vote.updated`
  - Vote cast/flip/remove, with current counters, score, and entry status.
- `track.locked`
  - Lock-window service moves an entry from `PENDING` to `LOCKED`.
- `track.unlocked`
  - Lock expiry releases an entry.
  - Guest challenge unlocks an entry.
- `token.updated`
  - Guest challenge spends one free challenge token.

The publisher also has methods ready for future milestones:

- `session.updated`
- `guest.joined`
- `track.queued_to_spotify`
- `now_playing.updated`
- `runner.status_changed`
- `session.ended`

Those are intentionally not called yet; M12/M13/M14 own the related state changes.

## Changed files

```text
README.md
package.json
package-lock.json
libs/shared-types/src/index.ts
libs/shared-types/src/realtime.ts
libs/shared-types/dist/index.d.ts
libs/shared-types/dist/index.js
libs/shared-types/dist/realtime.d.ts
libs/shared-types/dist/realtime.js
apps/api/src/main.ts
apps/api/src/app/app.module.ts
apps/api/src/app/common/cors-origins.ts
apps/api/src/app/modules/realtime/party.gateway.spec.ts
apps/api/src/app/modules/realtime/party.gateway.ts
apps/api/src/app/modules/realtime/realtime-event-publisher.spec.ts
apps/api/src/app/modules/realtime/realtime-event-publisher.ts
apps/api/src/app/modules/realtime/realtime-rooms.ts
apps/api/src/app/modules/realtime/realtime.module.ts
apps/api/src/app/modules/queue/queue.module.ts
apps/api/src/app/modules/queue/queue.service.spec.ts
apps/api/src/app/modules/queue/queue.service.ts
apps/api/src/app/modules/voting/vote.module.ts
apps/api/src/app/modules/voting/vote.service.spec.ts
apps/api/src/app/modules/voting/vote.service.ts
apps/api/src/app/modules/lock-window/challenge.service.spec.ts
apps/api/src/app/modules/lock-window/challenge.service.ts
apps/api/src/app/modules/lock-window/lock-window.module.ts
apps/api/src/app/modules/lock-window/lock-window.service.spec.ts
apps/api/src/app/modules/lock-window/lock-window.service.ts
```

## Tests added

12 new API tests (300 total):

- `party.gateway.spec.ts`
  - Guest joins the correct party and guest rooms.
  - Guest reconnects and rejoins rooms.
  - Missing token is rejected.
  - Host connects without joining a session room.
  - Owning host joins the host room.
  - Guest cannot join a host room.
  - Malformed session IDs are rejected.
  - Host ownership rejection surfaces.
  - Session broadcasts target party + host rooms.
- `realtime-event-publisher.spec.ts`
  - Builds standard envelopes.
  - Increments sequence numbers per session.
  - Sends token updates to both session and guest rooms.

Existing queue/vote/lock-window/challenge service tests were extended to assert publisher calls.

Verification:

```text
NX_DAEMON=false npx nx test  @fairplay/api --skip-nx-cache  ✅ 300/300
NX_DAEMON=false npx nx build @fairplay/api --skip-nx-cache  ✅
NX_DAEMON=false npx nx lint  @fairplay/api --skip-nx-cache  ✅ (1 pre-existing main.ts console warning)
```

## Database / Redis changes

- No DB migration.
- No Redis schema changes.
- Realtime is a process-local Socket.IO layer today. That is fine for the current single Railway API instance. If Railway scales the API horizontally, add a Socket.IO Redis adapter so room membership and broadcasts work across instances.

## Manual test steps

1. Start Redis and the API:

```bash
docker compose up -d redis
npm run dev:api
```

2. Connect as a guest with a guest JWT:

```ts
const socket = io('http://localhost:3000/party', {
  auth: { token: guestJwt },
});
socket.on('realtime.ready', console.log);
socket.on('queue.updated', console.log);
socket.on('vote.updated', console.log);
socket.on('track.locked', console.log);
socket.on('track.unlocked', console.log);
socket.on('token.updated', console.log);
```

3. Add a queue entry and confirm `queue.updated` with `reason=entry_added`.
4. Vote on the entry and confirm `vote.updated` plus `queue.updated` with `reason=score_changed`.
5. Wait for or invoke the lock-window path and confirm `track.locked` plus `queue.updated`.
6. Challenge a locked entry and confirm `track.unlocked`, `queue.updated`, and `token.updated`.
7. Disconnect and reconnect with the same guest JWT; confirm `realtime.ready` and room rejoin.
8. Connect as a host JWT and emit:

```ts
socket.emit('host.join_session', { sessionId }, console.log);
```

Confirm only the owning host receives `{ ok: true, room: "host:{sessionId}" }`.

## Known risks / limitations

- Sequence numbers are in-memory. They reset on process restart. Clients should use them for duplicate/ordering suppression within a connection era, not as a durable event log.
- No Socket.IO Redis adapter yet. Add it before running more than one API replica.
- `guest.joined`, `session.updated`, `session.ended`, runner, now-playing, and Spotify-dispatch events are exposed on the publisher but not emitted until their owning milestones wire the state changes.
- There is no replay endpoint. Reconnect support is room rejoin + idempotent client handling; the client should fetch current session/queue state after reconnect.

## Deployment

```text
Railway deploy 6829df47-d79b-4062-835f-18b9ed52b73d           ✅
GET /health                                                    ✅ status=ok
GET /health/db                                                 ✅ postgres ok
GET /health/redis                                              ✅ redis ok
Socket.IO /party without bearer token                          ✅ realtime.error UNAUTHORIZED
```

## Next milestone

Milestone 12 — Spotify Queue Runner.

M11 gives the runner the realtime publication path it needs for:

1. `track.queued_to_spotify` when the runner appends an entry to the host's Spotify queue.
2. `runner.status_changed` for runner health/activity changes.
