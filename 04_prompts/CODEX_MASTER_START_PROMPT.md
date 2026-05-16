# Codex Master Start Prompt

Copy/paste this into Codex before starting implementation.

```text
You are implementing FairPlay Party DJ, a party music queue platform.

Core rules:
1. The app does not stream music.
2. The backend only controls the host's Spotify Premium playback device using the host's OAuth token.
3. Guests never authenticate with Spotify.
4. Guests suggest, vote, and spend free session tokens inside our internal queue.
5. Our internal queue is the source of truth.
6. Spotify's queue is only a short output buffer of 1-2 tracks.
7. Free party tokens modify only internal state.
8. No monetization, Stripe, Apple IAP, or Google Play Billing in MVP.
9. Token boost/challenge must never directly call Spotify APIs.
10. Every milestone must include unit tests, integration tests, authorization checks, logs, and documentation updates.

Use:
- Nx monorepo
- NestJS API
- Next.js web app
- PostgreSQL
- Redis
- BullMQ worker for queue runner
- WebSockets for real-time updates
- Prisma or TypeORM consistently
- Pino structured logging
- Jest, Playwright, and k6/Artillery tests

Read:
- README.md
- 00_master/PROJECT_CONTEXT.md
- 00_master/IMPLEMENTATION_ORDER.md
- 01_standards/PROGRAMMING_STANDARDS.md
- 02_architecture/SYSTEM_ARCHITECTURE.md
- 02_architecture/SPOTIFY_INTEGRATION_RULES.md

Start with 03_milestones/MILESTONE_01_PROJECT_FOUNDATION.md.

Do not skip milestones.
Do not implement real payments.
Do not call real Spotify from automated tests; use mocks.
```
