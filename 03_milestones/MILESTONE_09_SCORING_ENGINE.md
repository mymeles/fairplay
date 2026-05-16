# Milestone 09 — Scoring Engine


## Goal

Centralize ranking logic so voting, tokens, aging, and host controls all use one score calculation path.

## Build Scope

Create:

```text
ScoringModule
ScoringService
ScoreRebuildService
```

## Formula

```ts
score =
  upvoteWeight * Math.log(1 + upvotes)
  - downvoteWeight * downvotes
  + boostWeight * boostCredits
  + ageWeight * minutesWaiting
  + hostPinWeight * hostPinned
```

## Session Scoring Settings

```json
{
  "upvoteWeight": 2,
  "downvoteWeight": 1,
  "boostWeight": 3,
  "ageWeight": 0.05,
  "hostPinWeight": 1000
}
```

## APIs

Internal only for now.

Optional admin/dev endpoint in non-prod:

```http
POST /api/v1/dev/sessions/:sessionId/recalculate-scores
```

## Tests

- No votes score.
- Upvotes increase rank.
- Downvotes decrease rank.
- Boosts increase rank.
- Aging helps old songs.
- Host pin dominates.
- Rebuild creates correct Redis order.

## Transition to Milestone 10

Lock-window logic depends on reliable top-ranked entries.



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
Implement Milestone 9: Scoring Engine.

Create ScoringModule, ScoringService, ScoreRebuildService.

Move all score calculation out of queue/vote modules.

Use session settings for weights.

Add:
calculateScore(entry, settings)
recalculateEntry(entryId)
recalculateSession(sessionId)
rebuildRedisProjection(sessionId)

Add unit tests for score math and integration tests for Redis ordering.
```
