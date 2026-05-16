# Milestone 08 — Voting System


## Goal

Allow guests to upvote/downvote queue entries.

## Build Scope

Create:

```text
VotingModule
VoteService
VoteRepository
```

Table:

```text
votes
```

## APIs

```http
POST /api/v1/queue/:entryId/vote
DELETE /api/v1/queue/:entryId/vote
```

## Rules

- One vote per guest per entry.
- Guest can change vote.
- Guest can remove vote.
- Vote updates aggregate counts.
- Score recalculates.
- Redis ZSET score updates if entry is pending.
- Locked entries receive votes but cannot be displaced until unlock.

## Tests

- Upvote increases score.
- Downvote decreases score.
- Vote change recalculates.
- Duplicate vote updates existing vote.
- Removed vote recalculates.
- Rate limit works.

## Transition to Milestone 9

Voting needs centralized scoring so future boost/aging/host-pin logic stays consistent.



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
Implement Milestone 8: Voting System.

Create VotingModule, VoteService, VoteRepository.

Endpoints:
POST /api/v1/queue/:entryId/vote
DELETE /api/v1/queue/:entryId/vote

Rules:
- one vote per guest per entry
- guest can change vote
- guest can remove vote
- score recalculates
- Redis ZSET updates for PENDING entries
- locked entries keep votes but do not move until unlocked

Add tests for all vote transitions and rate limiting.
```
