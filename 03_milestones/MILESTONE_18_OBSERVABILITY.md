# Milestone 18 — Observability


## Goal

Make the system debuggable in staging and production.

## Build Scope

Add:

```text
structured logging
request IDs
metrics endpoint
OpenTelemetry traces
Sentry integration
dashboard configs
```

## APIs

```http
GET /api/v1/health
GET /metrics
```

## Metrics

```text
api_request_duration_ms
api_request_total
websocket_clients_connected
websocket_event_fanout_duration_ms
active_sessions_total
queue_entries_created_total
votes_total
token_spend_total
runner_tick_duration_ms
runner_dispatch_success_total
runner_dispatch_failure_total
spotify_api_request_total
spotify_api_429_total
spotify_token_refresh_total
```

## Tests

- Request ID generated.
- Logs include requestId.
- Metrics increment for API calls.
- Runner metrics increment.
- Spotify 429 increments metric.

## Transition to Milestone 19

With observability in place, deployment can be done safely.



## Definition of Done

- Unit tests added.
- Integration tests added where applicable.
- Authorization rules tested.
- Error cases tested.
- Logs added for important actions.
- README or docs updated.
- Manual test steps written.
- No future milestone scope implemented.


## Codex/GPT-5.5 Prompt

```text
Implement Milestone 18: Observability.

Add:
- Pino structured logging
- request ID middleware
- Prometheus metrics at GET /metrics
- OpenTelemetry hooks
- Sentry placeholders/config

Instrument:
- API requests
- WebSocket events
- queue changes
- token spends
- runner ticks
- Spotify API calls
- Spotify 429

Add tests verifying logs/metrics.
```
