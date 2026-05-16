# Versatile Production-Quick Tech Stack

This stack optimizes for fast implementation, production readiness, and future scale.

## Recommended Stack

### Monorepo

- Nx workspace
- TypeScript everywhere
- Shared DTO/types package

Why:

- One repo for backend, webapp, workers, shared types.
- Good fit for Codex because boundaries are visible.
- Easy to add mobile later.

### Backend

- NestJS
- PostgreSQL
- Redis
- Prisma or TypeORM

Recommended choice:

```text
NestJS + PostgreSQL + Redis + Prisma
```

Why Prisma:

- Fast schema iteration.
- Strong TypeScript type generation.
- Good developer experience.
- Migrations are clean for MVP.

Use TypeORM only if your team strongly prefers entity decorators and repository patterns.

### Frontend

- Next.js web app
- Tailwind CSS
- shadcn/ui
- Framer Motion
- Socket.IO client or native WebSocket client

Why:

- Fast production web deployment.
- Great QR-based guest flow.
- Easy host dashboard.
- Good mobile browser/PWA experience.
- Gen-Z style is easy with Tailwind + animations.

### Real-Time

- WebSockets using Socket.IO initially

Why:

- Rooms are simple.
- Reconnect behavior is mature.
- Good enough for party sessions.

Future alternative:

- Native WebSocket if you need lower overhead later.

### Background Workers

- BullMQ with Redis
- Separate `runner` process

Why:

- Clean separation between API and Spotify queue runner.
- Retry/backoff support.
- Good worker visibility.

### Infrastructure

Quick production path:

- Docker
- Railway / Render / Fly.io for MVP
- Managed PostgreSQL
- Managed Redis
- Cloudflare for DNS/WAF

More scalable path:

- AWS ECS Fargate or GCP Cloud Run
- RDS Postgres
- ElastiCache / Memorystore Redis
- CloudWatch / Grafana Cloud

Kubernetes path only after product-market validation.

### Observability

- Pino structured logging
- OpenTelemetry traces
- Prometheus metrics
- Grafana dashboards
- Sentry for frontend/backend errors

### Testing

- Jest for unit/integration
- Testcontainers for Postgres/Redis integration tests
- Playwright for E2E web flows
- k6 or Artillery for load testing

## Why This Is Versatile

This stack supports:

- Fast MVP
- Production launch
- Web-first guest experience
- Later mobile app
- Later service split
- Later real payment integration
- Later multi-provider music support
