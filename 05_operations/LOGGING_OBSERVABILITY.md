# Logging and Observability

## Logging Library

Use Pino for backend structured logs.

Every log should be JSON.

## Required Fields

```json
{
  "level": "info",
  "time": "...",
  "requestId": "req_123",
  "sessionId": "session_123",
  "hostUserId": "user_123",
  "guestId": "guest_123",
  "queueEntryId": "entry_123",
  "event": "queue.entry.added",
  "message": "Queue entry added"
}
```

Only include fields that apply.

## Never Log

- Spotify access tokens
- Spotify refresh tokens
- OAuth authorization code
- raw QR token
- password/secrets
- precise GPS beyond what is needed
- full device fingerprint

## Event Names

Use consistent dotted names:

```text
session.created
session.join.accepted
session.join.rejected
queue.entry.added
queue.entry.voted
queue.entry.locked
queue.entry.unlocked
queue.entry.queued_to_spotify
runner.tick.started
runner.tick.completed
runner.spotify.rate_limited
runner.spotify.dispatch_failed
spotify.token.refreshed
host.device.selected
host.track.vetoed
guest.token.granted
guest.token.spent
moderation.guest.banned
```

## Metrics

Expose:

```http
GET /metrics
```

Recommended metrics:

```text
api_request_duration_ms
api_request_total
websocket_clients_connected
websocket_event_fanout_duration_ms
active_sessions_total
session_guest_count
queue_entries_created_total
votes_total
token_spend_total
runner_tick_duration_ms
runner_dispatch_success_total
runner_dispatch_failure_total
spotify_api_request_total
spotify_api_429_total
spotify_token_refresh_total
redis_operation_duration_ms
database_query_duration_ms
```

## Tracing

Use OpenTelemetry for:

- join flow
- search flow
- add to queue flow
- vote flow
- token spend flow
- runner dispatch flow
- Spotify API calls

## Dashboard Panels

### Party Health

- active sessions
- guests per session
- queue updates/sec
- websocket clients

### Spotify Health

- API calls by endpoint
- 429s
- dispatch success/failures
- token refresh failures
- runner tick duration

### App Health

- API p95 latency
- error rate
- DB latency
- Redis latency
- process memory/CPU

## Alerting

Start with alerts for:

- Spotify 429 spike.
- Runner dispatch failure rate > 10%.
- API 5xx rate > 2%.
- DB unavailable.
- Redis unavailable.
- WebSocket disconnect spike.
