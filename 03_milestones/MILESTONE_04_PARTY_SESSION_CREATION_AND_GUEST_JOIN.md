# Milestone 04 — Party Session Creation and Guest Join


## Goal

Let hosts create party sessions and let guests join with QR/session key.

## Build Scope

Create:

```text
SessionModule
GuestModule
JoinCodeService
QrTokenService
GuestAuthService
```

Tables:

```text
party_sessions
session_guests
guest_wallets
```

Guest wallet is created now because free tokens are part of join flow later.

## APIs

```http
POST /api/v1/sessions
GET /api/v1/sessions/:sessionId
POST /api/v1/sessions/:sessionId/join
POST /api/v1/sessions/:sessionId/end
```

## Session Settings

Default settings:

```json
{
  "lockSize": 2,
  "lockDurationSeconds": 90,
  "spotifyQueueDepthTarget": 1,
  "initialBoostTokens": 3,
  "initialChallengeTokens": 1,
  "allowExplicitTracks": true,
  "duplicateCooldownSeconds": 900,
  "maxSuggestionsPerGuest": 10,
  "proximityRequired": false
}
```

## Tests

- Host creates session.
- Join code is unique.
- Guest joins active session.
- Guest cannot join expired session.
- Guest cannot join ended session.
- Guest receives session-scoped JWT.
- Guest wallet is created.

## Transition to Milestone 5

Once guests can join, proximity trust scoring can be added to join flow.



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
Implement Milestone 4: Party Session Creation and Guest Join.

Create SessionModule and GuestModule.

Endpoints:
POST /api/v1/sessions
GET /api/v1/sessions/:sessionId
POST /api/v1/sessions/:sessionId/join
POST /api/v1/sessions/:sessionId/end

Generate:
- joinCode
- short-lived QR token
- guest JWT

Create guest wallet on join but do not implement token spending yet.

Add default session settings.
Add tests for active, expired, ended, and invalid join flows.
```
