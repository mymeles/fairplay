# Milestone 05 — Proximity Gate


## Goal

Reduce the chance of people outside the party joining.

## Build Scope

Create:

```text
ProximityModule
ProximityService
JoinTrustScorer
```

## Signals

```text
valid QR token
valid join code
coarse GPS within radius
Wi-Fi hash match
low-risk device
```

## Trust Score Example

```ts
qrTokenValid = 40
joinCodeValid = 25
gpsWithinRadius = 25
wifiHashMatch = 30
lowRiskDevice = 10
minimumRequiredScore = 50
```

## Join Request Additions

```json
{
  "displayName": "Meles",
  "joinCode": "ABC123",
  "qrToken": "...",
  "location": {
    "lat": 35.0,
    "lng": -78.0,
    "accuracyMeters": 50
  },
  "wifiHash": "...",
  "deviceHash": "..."
}
```

## Behavior

If `proximityRequired=false`, score is logged but not blocking.

If `proximityRequired=true`, score must pass threshold.

## Tests

- Valid QR + join code passes.
- GPS within radius contributes score.
- GPS far away fails when proximity is required.
- Wi-Fi hash match passes.
- Reasons are returned/logged.

## Transition to Milestone 6

After join is protected, guests can safely search and suggest tracks.



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
Implement Milestone 5: Proximity Gate.

Create ProximityService and JoinTrustScorer.

Integrate into POST /api/v1/sessions/:sessionId/join.

Support:
- qrTokenValid
- joinCodeValid
- gpsWithinRadius
- wifiHashMatch
- lowRiskDevice

Return/log:
allowed
score
reasons

If proximityRequired=false, do not block but log score.
If true, enforce threshold.

Add unit and integration tests.
```
