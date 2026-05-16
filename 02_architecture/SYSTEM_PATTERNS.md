# Proven System Patterns to Use

## 1. Modular Monolith

Start with a modular monolith instead of microservices.

Benefits:

- Easier Codex implementation.
- Fewer deployment pieces.
- Clear module boundaries.
- Easier testing.
- Can split later if needed.

## 2. Adapter Pattern

Use adapters for external systems.

```text
SpotifyPlaybackAdapter
SpotifySearchAdapter
RedisQueueRepository
```

Business services should not know HTTP details.

## 3. Repository Pattern

Use repositories for database access.

```text
SessionRepository
QueueEntryRepository
VoteRepository
TokenLedgerRepository
```

Business services should not contain raw SQL unless intentionally optimized.

## 4. Outbox-Lite Event Pattern

For MVP, keep a simple event publisher abstraction.

```ts
DomainEventPublisher.publish({
  type: 'queue.updated',
  sessionId,
  payload,
});
```

Behind it:

- WebSocket broadcast.
- Optional audit log.
- Future real outbox.

## 5. Idempotent Worker Pattern

Queue runner must be idempotent.

Use:

- DB transaction.
- Redis lock.
- `spotify_queued_at`.
- dispatch attempt table if needed.

## 6. Token Bucket Rate Limiting

Use Redis token bucket for:

- join attempts
- search
- voting
- queue add
- token spend
- host controls

## 7. Rebuildable Redis Projection

Redis should be rebuildable from Postgres.

Create maintenance command:

```bash
npm run queue:rebuild -- --sessionId=...
```

## 8. Circuit Breaker for Spotify

If repeated Spotify failures happen:

```text
CLOSED -> OPEN -> HALF_OPEN -> CLOSED
```

When open:

- Stop Spotify calls.
- Keep internal queue running.
- Show host warning.

## 9. Feature Flags

Use flags for risky features:

```text
RUNNER_ENABLED
PROXIMITY_REQUIRED
LOCK_WINDOW_ENABLED
TOKEN_BOOST_ENABLED
TOKEN_CHALLENGE_ENABLED
SPOTIFY_HOST_CONTROLS_ENABLED
```

## 10. Audit Everything Host-Important

Audit:

- session created/ended
- guest banned/muted
- track vetoed
- track pinned
- runner started/stopped
- device changed
- token grant/spend
