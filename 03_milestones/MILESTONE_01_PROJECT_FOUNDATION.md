# Milestone 01 — Project Foundation


## Goal

Create the base Nx/NestJS/Next.js project structure with PostgreSQL, Redis, configuration, health checks, and test harness.

## Why This Comes First

Every other milestone depends on the API booting cleanly, database/Redis being reachable, and test infrastructure being stable.

## Build Scope

Create:

```text
apps/api
apps/web
apps/runner
libs/shared-types
libs/shared-utils
```

Backend modules:

```text
ConfigModule
DatabaseModule
RedisModule
HealthModule
ObservabilityModule
```

Local services:

```text
PostgreSQL
Redis
API
Runner placeholder
Web placeholder
```

## APIs

```http
GET /api/v1/health
GET /api/v1/health/db
GET /api/v1/health/redis
```

## Environment Variables

```env
DATABASE_URL=
REDIS_URL=
NODE_ENV=development
PORT=3000
```

## Tests

Unit:

- Config loads required values.
- Health service returns expected shape.

Integration:

- API starts.
- DB health check passes.
- Redis health check passes.

## Manual Verification

```bash
docker compose up
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/health/db
curl http://localhost:3000/api/v1/health/redis
```

## Transition to Milestone 2

After this, Spotify auth can be added because the project has config, persistence, tests, and health checks.



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
Implement Milestone 1: Project Foundation.

Create an Nx monorepo with:
- apps/api NestJS
- apps/web Next.js
- apps/runner NestJS worker placeholder
- shared libraries for DTOs/types/utils

Add:
- ConfigModule
- DatabaseModule PostgreSQL
- RedisModule
- HealthModule
- ObservabilityModule placeholder

Add Docker Compose for api, web, runner, postgres, redis.

Add endpoints:
GET /api/v1/health
GET /api/v1/health/db
GET /api/v1/health/redis

Add Jest unit and integration tests.
Do not implement Spotify, sessions, queue, or frontend features yet.
```
