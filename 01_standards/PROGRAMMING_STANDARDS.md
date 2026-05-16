# Programming Standards

## Architecture Style

Use a modular monolith first.

Recommended backend structure:

```text
apps/api/src/app/
  modules/
    auth/
    spotify/
    sessions/
    guests/
    tracks/
    queue/
    voting/
    scoring/
    lock-window/
    tokens/
    moderation/
    websocket/
    observability/
  common/
    decorators/
    filters/
    guards/
    interceptors/
    pipes/
    types/
    utils/
```

A modular monolith gives production speed while keeping boundaries clean enough to split into services later.

## Core Rules

1. Controllers are thin.
2. Services contain business logic.
3. Repositories isolate database queries.
4. External integrations use adapters.
5. DTOs define all request/response contracts.
6. No direct Spotify calls outside the Spotify module.
7. No direct Redis queue mutations outside queue/scoring/lock modules.
8. No raw environment variable access outside ConfigModule.
9. No untyped `any` unless explicitly justified.
10. No background job without logs, metrics, and retry behavior.

## Naming Conventions

### Files

```text
queue-entry.entity.ts
queue.service.ts
queue.controller.ts
create-session.dto.ts
spotify-playback.adapter.ts
```

### Classes

```ts
QueueService
SpotifyPlaybackAdapter
CreateSessionDto
QueueEntryEntity
```

### Methods

Use action-oriented names:

```ts
createSession()
joinSession()
calculateScore()
lockTopEntries()
appendNextTrackToSpotify()
```

Avoid vague names:

```ts
handle()
process()
doStuff()
runThing()
```

## Error Handling

Use typed domain errors.

Example:

```ts
throw new DomainError('SESSION_EXPIRED', 'This party session has expired.');
```

Standard error shape:

```json
{
  "error": {
    "code": "SESSION_EXPIRED",
    "message": "This party session has expired.",
    "requestId": "req_123",
    "details": {}
  }
}
```

## Validation

Use DTO validation for every public endpoint.

Rules:

- Validate UUIDs.
- Validate enum values.
- Validate string lengths.
- Validate lat/lng range.
- Validate token amount bounds.
- Reject unknown fields where possible.

## Transaction Rules

Use database transactions when a change affects more than one persistent record.

Examples:

- Guest joins session and wallet is created.
- Track is added and queue entry is created.
- Token is spent and score is updated.
- Host veto removes entry and audit log is written.

## Redis Consistency Rule

Postgres is the durable source. Redis is the fast-ranking source.

Every Redis mutation must have a repair path.

Examples:

- Rebuild session ZSET from Postgres.
- Recalculate all session scores.
- Clear orphaned locked entries.

## Code Review Checklist

Before merging:

- Is this module boundary clean?
- Is the API response typed?
- Are failure paths tested?
- Is this endpoint authorized?
- Are logs useful but not noisy?
- Could this create duplicate Spotify queue additions?
- Could this leak tokens?
- Can this be debugged in production?
