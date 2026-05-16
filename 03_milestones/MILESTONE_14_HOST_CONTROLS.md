# Milestone 14 — Host Controls


## Goal

Give the host final control over the party.

## Build Scope

Create:

```text
HostControlModule
HostControlService
SessionSettingsService
```

## APIs

```http
POST /api/v1/queue/:entryId/pin
POST /api/v1/queue/:entryId/unpin
POST /api/v1/queue/:entryId/veto
POST /api/v1/sessions/:sessionId/runner/start
POST /api/v1/sessions/:sessionId/runner/stop
PATCH /api/v1/sessions/:sessionId/settings
POST /api/v1/host/spotify/skip
POST /api/v1/host/spotify/pause
POST /api/v1/host/spotify/resume
```

## Rules

- Host only.
- Pin recalculates score.
- Veto removes from Redis and marks VETOED.
- Runner stop prevents Spotify queue additions.
- Settings changes affect future scoring/locking.
- Spotify skip/pause/resume are host-only and optional.

## Tests

- Guest cannot call host controls.
- Host can pin.
- Host can veto locked entry.
- Runner start/stop toggles state.
- Settings validation works.
- Spotify control errors handled.

## Transition to Milestone 15

Host controls are stable; now free token economy can be completed.



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
Implement Milestone 14: Host Controls.

Create HostControlModule, HostControlService, SessionSettingsService.

Endpoints:
POST /api/v1/queue/:entryId/pin
POST /api/v1/queue/:entryId/unpin
POST /api/v1/queue/:entryId/veto
POST /api/v1/sessions/:sessionId/runner/start
POST /api/v1/sessions/:sessionId/runner/stop
PATCH /api/v1/sessions/:sessionId/settings
POST /api/v1/host/spotify/skip
POST /api/v1/host/spotify/pause
POST /api/v1/host/spotify/resume

Add host authorization tests and mocked Spotify tests.
```
