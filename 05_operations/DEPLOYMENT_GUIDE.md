# Deployment Guide

## MVP Deployment Strategy

Fastest production path:

```text
Frontend: Vercel
API: Railway / Render / Fly.io
Worker: Railway / Render / Fly.io
Postgres: Managed Postgres
Redis: Managed Redis
DNS/WAF: Cloudflare
Monitoring: Grafana Cloud + Sentry
```

This gets you to production quickly without Kubernetes complexity.

## Production-Ready Container Layout

Services:

```text
web
api
runner
postgres
redis
```

In production, Postgres and Redis should be managed services.

## Environment Variables

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=
REDIS_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
TOKEN_ENCRYPTION_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_REDIRECT_URI=
FRONTEND_BASE_URL=
API_BASE_URL=
RUNNER_ENABLED=true
PROXIMITY_REQUIRED=false
LOCK_WINDOW_ENABLED=true
TOKEN_BOOST_ENABLED=true
TOKEN_CHALLENGE_ENABLED=true
```

## Docker Compose for Local Dev

```yaml
services:
  api:
    build: .
    command: npm run start:api:dev
    env_file: .env
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis

  runner:
    build: .
    command: npm run start:runner:dev
    env_file: .env
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: fairplay
      POSTGRES_PASSWORD: fairplay
      POSTGRES_DB: fairplay
    ports:
      - "5432:5432"

  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

## Build Pipeline

CI stages:

```text
install
lint
typecheck
unit tests
integration tests
build
docker build
security scan
deploy staging
run smoke tests
promote production
```

## Release Strategy

Use:

- Staging environment.
- Feature flags.
- Blue/green or rolling deploy.
- Database migrations before app rollout.
- Backward-compatible schema changes.

## Deployment Checklist

Before production:

- Health endpoint passes.
- DB migrations applied.
- Redis reachable.
- Spotify redirect URI registered.
- CORS configured.
- WebSocket origin restricted.
- Logs flowing.
- Metrics flowing.
- Sentry configured.
- Rate limits configured.
- Secrets not in repo.
- Runner feature flag tested.
- Manual fallback tested.

## Rollback Plan

If API breaks:

1. Disable runner.
2. Roll back API container.
3. Keep internal queue data.
4. Rebuild Redis projection if needed.

If Spotify API issues happen:

1. Open circuit breaker.
2. Keep voting/search internal where possible.
3. Show host degraded banner.
4. Use manual queue fallback.
