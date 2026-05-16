# Milestone 19 — Deployment


## Goal

Prepare the system for staging and production deployment.

## Build Scope

Create:

```text
Dockerfiles
docker-compose.yml
staging env template
production env template
deployment README
migration scripts
release checklist
rollback checklist
```

## Recommended Deployment

MVP:

```text
Frontend: Vercel
API: Railway/Render/Fly.io
Runner: Railway/Render/Fly.io
Postgres: Managed
Redis: Managed
DNS/WAF: Cloudflare
```

## Required Docs

- Local setup.
- Staging setup.
- Production setup.
- Env vars.
- Spotify app configuration.
- Redirect URI setup.
- Database migrations.
- Redis setup.
- Logging/metrics setup.
- Rollback.

## Tests

- Docker build succeeds.
- Compose boots locally.
- Migrations run.
- Smoke tests pass after deploy.

## Transition to Milestone 20

After deploy works, load testing validates readiness.



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
Implement Milestone 19: Deployment.

Create production-ready Dockerfiles, docker-compose.yml, env templates, migration scripts, and deployment docs.

Add:
- local deployment instructions
- staging deployment instructions
- production deployment instructions
- release checklist
- rollback checklist
- smoke test script

Do not introduce Kubernetes unless optional docs only.
Ensure docker compose can boot API, web, runner, postgres, redis.
```
