# Web E2E tests

Playwright lives here. The smoke spec only needs a working `next build` —
the realtime/API-dependent specs are deferred to a later milestone once
the dev stack has fixtures.

## Run the smoke spec locally

```bash
# Install the chromium binary once
npm --workspace @fairplay/web run test:e2e:install

# Build the web app, then let Playwright start `next start` automatically
npm --workspace @fairplay/web run build
npm --workspace @fairplay/web run test:e2e
```

For hot-reload while iterating:

```bash
PLAYWRIGHT_USE_DEV=1 npm --workspace @fairplay/web run test:e2e
```

## Run the full device matrix

```bash
PLAYWRIGHT_FULL_MATRIX=1 npm --workspace @fairplay/web run test:e2e
```

## Future specs

Full host/guest flows (`host-create`, `guest-join`, `search-add`, `vote`,
`boost`, `lock-challenge`, `host-veto`, `runner-status`) need:

- A running API (`npm run dev:api`)
- A running Postgres + Redis (`npm run docker:up`)
- A test-only `/dev/host-jwt` mint endpoint to bypass the Spotify OAuth
  callback, OR a recorded HAR fixture for the Spotify edge function

These are scoped to a follow-up milestone alongside the dev stack docs.
The smoke spec here keeps the build pipeline honest in the meantime.
