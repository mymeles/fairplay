# Load Test Plan

## Tools

Use one of:

- k6
- Artillery
- Locust

Recommended: k6 for API and Artillery for WebSockets if needed.

## Scenarios

### Scenario 1: Join Burst

```text
1000 guests join over 60 seconds
```

Measure:

- join latency
- failed joins
- DB writes
- rate limit false positives

### Scenario 2: Voting Burst

```text
5000 votes over 2 minutes
```

Measure:

- vote endpoint p95
- Redis ZSET update latency
- WebSocket fanout latency
- score correctness after burst

### Scenario 3: Queue Add Burst

```text
100 tracks suggested in 5 minutes
```

Measure:

- duplicate rejection
- track normalization cache hit rate
- queue ranking correctness

### Scenario 4: Token Spend

```text
500 token boosts/challenges over 10 minutes
```

Measure:

- token ledger consistency
- wallet balance correctness
- double-spend prevention

### Scenario 5: Runner Soak

```text
60-minute session with mocked Spotify
```

Measure:

- no duplicate dispatch
- backoff behavior
- queue depth target
- lock-window interaction

## Release Gate

Do not launch public beta unless:

```text
vote p95 < 200ms
join p95 < 500ms
WebSocket queue update p95 < 1000ms
runner duplicate dispatch count = 0
Spotify 429 handling tested
Redis rebuild tested
```
