# Milestone 07 — Internal Queue


## Goal

Create the internal queue that becomes the app's source of truth.

## Build Scope

Create:

```text
QueueModule
QueueService
QueueEntryRepository
RedisQueueRepository
```

Table:

```text
queue_entries
```

Redis key:

```text
party:{sessionId}:pending
```

## APIs

```http
POST /api/v1/sessions/:sessionId/queue
GET /api/v1/sessions/:sessionId/queue
DELETE /api/v1/queue/:entryId
```

## Statuses

```text
PENDING
LOCKED
QUEUED_TO_SPOTIFY
PLAYING
PLAYED
REMOVED
VETOED
```

## Rules

- Guest can add normalized Spotify track.
- Persist track if new.
- Persist queue entry.
- Calculate initial score.
- Add PENDING entry to Redis ZSET.
- Enforce duplicate cooldown.
- Enforce max suggestions per guest.

## Tests

- Guest adds track.
- Track upsert works.
- Queue entry persisted.
- Redis ZSET updated.
- Duplicate cooldown works.
- Max suggestions enforced.
- Guest cannot add to ended session.

## Transition to Milestone 8

With queue entries created, voting can update their rank.



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
Implement Milestone 7: Internal Queue.

Create QueueModule, QueueService, QueueEntryRepository, RedisQueueRepository.

Endpoints:
POST /api/v1/sessions/:sessionId/queue
GET /api/v1/sessions/:sessionId/queue
DELETE /api/v1/queue/:entryId

On add:
- upsert track
- create queue entry
- calculate initial score
- add to Redis ZSET party:{sessionId}:pending

Implement duplicate cooldown and max suggestions.
Add unit/integration tests.
```
