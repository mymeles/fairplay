# Milestone 12 — Spotify Queue Runner


## Goal

Append the next eligible internal queue entry to the host's Spotify queue using the host's token.

## Build Scope

Create:

```text
RunnerWorker
QueueDispatchService
SpotifyQueueService
RunnerStateService
SpotifyCircuitBreaker
```

## Spotify APIs

```http
GET /v1/me/player
GET /v1/me/player/queue
POST /v1/me/player/queue
```

## Runner Rules

- Only active sessions.
- Runner must be enabled.
- Host must have valid Spotify token.
- Selected/active device required.
- Do not dispatch LOCKED entries.
- Do not dispatch already queued entries.
- Keep Spotify buffer to 1–2 tracks only.
- Use Redis lock to prevent duplicate dispatch.
- Honor Spotify 429 Retry-After.
- Publish runner status events.

## Tests

- Adds track successfully.
- Does not add locked track.
- Does not add duplicate.
- Does not overfill Spotify queue.
- Handles 401 refresh.
- Handles 403 Premium required.
- Handles 429 Retry-After.
- Handles no active device.
- Circuit breaker opens after repeated failures.

## Transition to Milestone 13

After songs are queued, now-playing sync can update PLAYING/PLAYED states.



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
Implement Milestone 12: Spotify Queue Runner.

Create RunnerWorker, QueueDispatchService, SpotifyQueueService, RunnerStateService, SpotifyCircuitBreaker.

Runner loop:
1. load active sessions
2. verify runner enabled
3. verify host token
4. verify selected/active device
5. check Spotify queue depth
6. pick next eligible PENDING entry
7. skip LOCKED entries
8. acquire dispatch lock
9. call POST /v1/me/player/queue
10. mark QUEUED_TO_SPOTIFY
11. publish event
12. honor 429 Retry-After

Use mocked Spotify tests only.
```
