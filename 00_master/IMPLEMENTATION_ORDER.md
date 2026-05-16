# Implementation Order

Implement in this exact order.

```text
01. Project Foundation
02. Spotify Host Authentication
03. Spotify Device Control
04. Party Session Creation and Guest Join
05. Proximity Gate
06. Track Search and Normalization
07. Internal Queue
08. Voting System
09. Scoring Engine
10. Lock Window and Free Token Challenge
11. Real-Time WebSockets
12. Spotify Queue Runner
13. Now Playing Sync
14. Host Controls
15. Session Token Economy
16. Moderation and Abuse Protection
17. Frontend MVP
18. Observability
19. Deployment
20. Load Testing and Release Hardening
```

## Why This Order Matters

### Foundation before features

Health checks, database, Redis, and module structure must be stable before business logic.

### Spotify auth before Spotify control

Device control and queue runner depend on the host's OAuth token and refresh flow.

### Internal queue before runner

The app must be able to rank tracks before anything is sent to Spotify.

### Locking before runner

The runner must know which tracks are eligible and which tracks are protected.

### Tokens before monetization

MVP uses free session tokens only. Real monetization should not be added until policy, legal, and app-store strategy are validated.

### Frontend after backend contracts

The frontend should bind to stable API/DTO contracts instead of causing backend churn.

### Observability before production

A queue runner connected to Spotify must be observable before launch.
