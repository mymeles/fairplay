# Milestone 10 — Lock Window and Free Token Challenge


## Goal

Protect the top 2 songs for a short time before they can be queued, while allowing guests to spend free challenge tokens to unlock/reopen competition.

## Build Scope

Create:

```text
LockWindowModule
LockWindowService
LockWindowScheduler
ChallengeService
```

Redis key:

```text
party:{sessionId}:locked
```

## Rules

- Top N pending entries become LOCKED.
- Default N = 2.
- `lockedUntil = now + lockDurationSeconds`.
- Normal votes do not displace locked entries.
- Locked entries can still collect votes.
- Host veto overrides lock.
- Challenge token clears lock and returns entry to PENDING.
- Challenge does not call Spotify.
- Challenge does not guarantee playback.

## APIs

```http
POST /api/v1/queue/:entryId/challenge-lock
POST /api/v1/queue/:entryId/veto
```

## Tests

- Top 2 become locked.
- Locked entries are removed from pending ZSET.
- Expired locks return to pending ZSET.
- Challenge consumes token and unlocks.
- Challenge fails without token.
- Veto works on locked entry.

## Transition to Milestone 11

Now that queue state changes are meaningful, real-time updates are needed.



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
Implement Milestone 10: Lock Window and Free Token Challenge.

Create LockWindowModule, LockWindowService, LockWindowScheduler, ChallengeService.

Rules:
- top 2 pending tracks become LOCKED
- lockedUntil uses session setting
- expired locks return to PENDING
- challenge token clears lock and returns entry to PENDING
- challenge does not call Spotify
- host veto overrides lock

Endpoints:
POST /api/v1/queue/:entryId/challenge-lock
POST /api/v1/queue/:entryId/veto

Add tests for lock, unlock, challenge, insufficient tokens, and veto.
```
