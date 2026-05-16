# Testing Strategy

## Test Pyramid

```text
Many unit tests
Moderate integration tests
Focused E2E tests
Few load/chaos tests
```

## Unit Tests

Use for:

- scoring
- lock window
- token spend
- moderation rules
- proximity trust score
- Spotify response parsing
- validation helpers

## Integration Tests

Use Testcontainers or Docker services for:

- Postgres repositories
- Redis queue behavior
- API endpoints
- WebSocket rooms
- runner with mocked Spotify API

## E2E Tests

Use Playwright.

Core flows:

1. Host connects Spotify mock.
2. Host creates session.
3. Guest joins.
4. Guest searches.
5. Guest adds track.
6. Guest votes.
7. Guest spends token.
8. Track locks.
9. Runner queues track.
10. Now playing updates.

## Spotify Mock Server

Do not hit real Spotify in automated tests.

Create mock endpoints:

```text
GET /v1/search
GET /v1/me/player
GET /v1/me/player/devices
GET /v1/me/player/queue
POST /v1/me/player/queue
PUT /v1/me/player
```

Mock scenarios:

- success
- 401 expired token
- 403 non-premium
- 429 Retry-After
- 500 transient error
- no active device
- empty queue

## Load Test Targets

Initial targets:

```text
1 host
1000 guests
100 queue entries
5000 votes
500 token spends
60 minute session
```

Success metrics:

```text
API p95 < 200ms for voting
WebSocket update p95 < 1s
No duplicate Spotify dispatch
Runner stable under mocked Spotify 429s
Redis memory stable
No DB slow query explosion
```

## Required Tests Per Milestone

Each milestone file includes specific tests. Do not mark complete unless the tests pass.
