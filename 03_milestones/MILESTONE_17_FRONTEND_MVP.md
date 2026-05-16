# Milestone 17 — Frontend MVP


## Goal

Build a production-ready web MVP for host and guests.

## Build Scope

Use:

```text
Next.js
Tailwind
shadcn/ui
Framer Motion
WebSocket client
```

## Host Pages

```text
/host/login
/host/sessions/new
/host/sessions/:sessionId/qr
/host/sessions/:sessionId/devices
/host/sessions/:sessionId/dashboard
/host/sessions/:sessionId/settings
/host/sessions/:sessionId/moderation
```

## Guest Pages

```text
/join
/party/:sessionId
/party/:sessionId/search
/party/:sessionId/queue
/party/:sessionId/wallet
```

## Required UX

- Mobile-first.
- Dark mode.
- Gen-Z visual style from frontend guide.
- Floating now-playing card.
- Token balance always visible.
- Lock/challenge state obvious.
- Queue updates animated.
- Host QR screen readable across room.

## Tests

Playwright:

- Host creates session.
- Guest joins.
- Guest searches.
- Guest adds track.
- Guest votes.
- Guest boosts.
- Track locks.
- Host vetoes.
- Runner status visible.

## Transition to Milestone 18

Frontend exists; now production observability can be completed.



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
Implement Milestone 17: Frontend MVP.

Build Next.js web app with host and guest flows.

Follow 06_frontend/GEN_Z_WEBAPP_LAYOUT.md.

Host pages:
- login
- create session
- QR display
- device selection
- dashboard
- settings
- moderation

Guest pages:
- join
- party home
- search
- queue
- wallet

Use WebSockets for live queue updates.
Add Playwright E2E tests.
Do not add real payments.
```
