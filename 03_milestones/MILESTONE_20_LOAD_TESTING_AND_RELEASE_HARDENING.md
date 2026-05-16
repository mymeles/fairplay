# Milestone 20 — Load Testing and Release Hardening


## Goal

Prove the system works under real party load.

## Load Targets

```text
1 host
1000 guests
100 suggested tracks
5000 votes
500 token spends
60-minute session
```

## Build Scope

Create load tests:

```text
join burst
search burst
queue add burst
vote burst
token spend burst
WebSocket soak
runner soak with mocked Spotify
```

## Success Criteria

```text
vote API p95 < 200ms
join API p95 < 500ms
WebSocket update p95 < 1000ms
duplicate Spotify dispatch count = 0
runner recovers from mocked 429
Redis projection rebuild works
no unbounded memory growth
```

## Release Hardening

Add:

- final security review.
- final Spotify integration review.
- final UI mobile pass.
- final runbook review.
- staging beta checklist.
- known limitations doc.

## Final Transition

After this milestone, the system is ready for closed beta.



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
Implement Milestone 20: Load Testing and Release Hardening.

Create k6 or Artillery tests for:
- 1000 guest joins
- 100 suggested tracks
- 5000 votes
- 500 token spends
- 60-minute WebSocket session
- runner soak with mocked Spotify

Measure:
- API p95
- WebSocket p95
- Redis memory
- Postgres latency
- duplicate dispatch count
- runner recovery from 429

Create release checklist and known limitations doc.
```
