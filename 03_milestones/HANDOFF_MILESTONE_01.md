# Handoff — Milestone 01: Project Foundation

## Completed

- Nx monorepo scaffolded with workspaces for `apps/*` and `libs/*`.
- NestJS API (`apps/api`) booted with global prefix `/api/v1`, validation pipe, response envelope interceptor, and domain exception filter.
- ConfigModule loads and validates environment via Zod (`NODE_ENV`, `PORT`, `LOG_LEVEL`, `DATABASE_URL`, `REDIS_URL`).
- DatabaseModule wraps `PrismaClient` (`PrismaService.ping()` for health probe).
- RedisModule wraps `ioredis` (`RedisService.ping()` for health probe).
- HealthModule exposes `/api/v1/health`, `/api/v1/health/db`, `/api/v1/health/redis`.
- ObservabilityModule wires `nestjs-pino` with request-id propagation, secret redaction, and `pino-pretty` in non-prod.
- `apps/runner` placeholder logs a heartbeat (real BullMQ worker added in Milestone 12).
- `apps/web` Next.js App Router placeholder renders the configured API base URL.
- Shared libs: `@fairplay/shared-types` (DTO/response/health/id types) and `@fairplay/shared-utils` (`DomainError`, response envelopes, request-id helper).
- Prisma schema with `users` + `spotify_tokens` (other domain tables deferred to later milestones — explicitly out-of-scope here).
- Docker Compose stack (`postgres`, `redis`, `api`, `runner`, `web`) with multi-stage Dockerfiles for each TS service.
- Jest unit tests for `AppConfigService`, `HealthService`, `DomainError`, and response envelopes.
- Jest integration test (`test:integration`) that boots Nest and hits all three `/health` endpoints, including a negative test for unknown routes returning the standard error envelope.
- README updated with run/test instructions.

## Changed files

```
.dockerignore
.env.example
.eslintrc.json
.gitignore
.prettierrc
README.md
docker-compose.yml
jest.config.ts
jest.preset.js
nx.json
package.json
tsconfig.base.json

apps/api/Dockerfile
apps/api/package.json
apps/api/tsconfig.json
apps/api/tsconfig.build.json
apps/api/jest.config.ts
apps/api/jest.integration.config.ts
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/.gitkeep
apps/api/src/main.ts
apps/api/src/app/app.module.ts
apps/api/src/app/common/filters/domain-exception.filter.ts
apps/api/src/app/common/interceptors/response-envelope.interceptor.ts
apps/api/src/app/common/middleware/request-context.middleware.ts
apps/api/src/app/modules/config/app-config.module.ts
apps/api/src/app/modules/config/app-config.service.ts
apps/api/src/app/modules/config/app-config.service.spec.ts
apps/api/src/app/modules/config/env.schema.ts
apps/api/src/app/modules/database/database.module.ts
apps/api/src/app/modules/database/prisma.service.ts
apps/api/src/app/modules/health/health.controller.ts
apps/api/src/app/modules/health/health.module.ts
apps/api/src/app/modules/health/health.service.ts
apps/api/src/app/modules/health/health.service.spec.ts
apps/api/src/app/modules/observability/observability.module.ts
apps/api/src/app/modules/redis/redis.module.ts
apps/api/src/app/modules/redis/redis.service.ts
apps/api/test/health.int-spec.ts
apps/api/test/setup.ts

apps/runner/Dockerfile
apps/runner/package.json
apps/runner/tsconfig.json
apps/runner/tsconfig.build.json
apps/runner/jest.config.ts
apps/runner/src/main.ts

apps/web/Dockerfile
apps/web/package.json
apps/web/tsconfig.json
apps/web/jest.config.ts
apps/web/next-env.d.ts
apps/web/next.config.mjs
apps/web/app/layout.tsx
apps/web/app/page.tsx
apps/web/public/.gitkeep

libs/shared-types/package.json
libs/shared-types/tsconfig.json
libs/shared-types/src/health.ts
libs/shared-types/src/ids.ts
libs/shared-types/src/index.ts
libs/shared-types/src/response.ts
libs/shared-utils/package.json
libs/shared-utils/tsconfig.json
libs/shared-utils/jest.config.ts
libs/shared-utils/src/domain-error.ts
libs/shared-utils/src/domain-error.spec.ts
libs/shared-utils/src/index.ts
libs/shared-utils/src/request-id.ts
libs/shared-utils/src/response-envelope.ts
libs/shared-utils/src/response-envelope.spec.ts
```

## New APIs

| Method | Path                       | Auth   | Description                           |
| ------ | -------------------------- | ------ | ------------------------------------- |
| GET    | `/api/v1/health`           | Public | Service liveness + version + uptime.  |
| GET    | `/api/v1/health/db`        | Public | Postgres reachability + latency (ms). |
| GET    | `/api/v1/health/redis`     | Public | Redis reachability + latency (ms).    |

All responses use `{ data, meta: { requestId } }`. Errors use `{ error: { code, message, requestId, details? } }`.

## New env vars

```
NODE_ENV
PORT
LOG_LEVEL
DATABASE_URL
REDIS_URL
NEXT_PUBLIC_API_BASE_URL    # used by apps/web only
```

## Tests added

- **Unit:** `AppConfigService` (defaults, validation, production flag), `HealthService` (shape, success + failure paths for Postgres/Redis), `DomainError` (status mapping, details), response envelope helpers.
- **Integration:** Boots `AppModule` and hits all three `/health` endpoints + negative test for unknown route returning standard error envelope.

## Known issues / limitations

- `npm install` has not been run in this environment; the lockfile will be generated on first install.
- Prisma migrations directory is empty — run `npm run prisma:migrate -- --name init` after the first install to materialize `users` + `spotify_tokens`.
- The runner heartbeat is a placeholder until Milestone 12 (Spotify Queue Runner).
- The web app is a static placeholder; the real Gen-Z UI lands in Milestone 17.
- No CI workflow yet — Milestone 19 (Deployment) is the right place to add GitHub Actions.

## Next milestone dependencies (Milestone 02 — Spotify Host Authentication)

Milestone 2 can now proceed because:

- `apps/api` boots, validates config, and connects to Postgres + Redis.
- `users` and `spotify_tokens` tables are defined in the Prisma schema.
- `DomainError` + standard error envelope are wired, so OAuth failures already have a typed response path.
- Pino logging redacts `*.access_token` / `*.refresh_token` so OAuth values cannot leak via logs.
- Health endpoints are available for Milestone 2's deploy/manual-test workflow.
