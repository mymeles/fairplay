# Handoff — Milestone 17: Frontend MVP

## Completed

Built the FairPlay DJ frontend on top of the existing `apps/web` Next.js 14
scaffold. The visual language follows `06_frontend/GEN_Z_WEBAPP_LAYOUT.md`:
dark-first, neon purple→pink→cyan gradient, mobile-first, motion via
Framer Motion, accessible.

### Stack additions (`apps/web/package.json`)

- **UI / styling**: Tailwind CSS 3, `tailwindcss-animate`, custom `tailwind.config.ts`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`.
- **Component primitives** (shadcn/ui pattern, sources owned in-repo under `components/ui/`): `@radix-ui/react-dialog`, `-dropdown-menu`, `-label`, `-progress`, `-separator`, `-slot`, `-switch`, `-tabs`, `-toast`, `-tooltip`.
- **Motion**: `framer-motion`.
- **State / data**: `@tanstack/react-query`, `zustand` (toast store).
- **Realtime**: `socket.io-client` against the existing `/party` namespace.
- **Forms**: `react-hook-form`, `@hookform/resolvers`, `zod` (reused from the API).
- **QR + theme**: `qrcode.react`, `next-themes`.
- **Test**: `@playwright/test`, `@testing-library/react`, `@testing-library/jest-dom`, `jest-environment-jsdom`.
- **Dev**: `tailwindcss`, `postcss`, `autoprefixer`, `eslint-config-next`.

A root-level `overrides` block in `package.json` pins `react`/`react-dom`/`@types/react`/`@types/react-dom` to 18.3.x — `@nx/react` (transitive via `@nx/next`) pulled in React 19 which caused duplicate-React hook crashes during `next build`.

### Project layout

```
apps/web/
  app/
    layout.tsx              Inter + JetBrains Mono fonts, AppProviders shell
    providers.tsx           QueryProvider + Toaster
    globals.css             Tailwind layers + reduced-motion guard
    page.tsx                Landing: brand, Host / Join CTAs
    join/page.tsx           Guest join (code/QR + name + opt-in geo)
    host/
      login/page.tsx        Spotify OAuth entry
      auth/complete/page.tsx Receives token+user_id from edge function
      sessions/
        new/page.tsx        Configure lock, tokens, rules, then create
        [sessionId]/
          layout.tsx        Sticky header + tab nav + WS provider
          page.tsx          Redirects → dashboard
          qr/page.tsx       QR + giant join code + live join counter
          devices/page.tsx  Spotify devices, runner control, playback
          dashboard/page.tsx Now-playing, queue, pin/veto, runner badge
          settings/page.tsx PATCH /sessions/:id/settings (live)
          moderation/page.tsx Blacklist track/artist + mute/ban/unmute
    party/
      [sessionId]/
        layout.tsx          Top bar + mobile bottom nav + WS provider
        page.tsx            Home: now-playing + locked rail + CTAs
        search/page.tsx     Debounced Spotify search → add
        queue/page.tsx      Voting, boost, challenge, remove-own
        wallet/page.tsx     Boost / Challenge token counters
  components/
    ui/                     Button, Card, Input, Label, Switch, Badge,
                            Dialog, Tabs, Toast/Toaster, Separator, Skeleton
    domain/                 NowPlayingCard, QueueCard, TokenBalance,
                            RunnerStatusBadge, TrackResultCard, ConnectionPill
  lib/
    utils.ts                cn(), formatDuration, formatRelativeTime
    auth/                   localStorage-backed host + guest token stores +
                            React hooks (useHostAuth, useGuestAuth)
    api/                    Typed apiFetch (envelope unwrap, ApiError) +
                            one function per controller route
    realtime/               socket.io client + PartySocketProvider that
                            bridges WS events into React Query cache and
                            tracks now-playing/runner/token state
    query/                  QueryProvider + qk (typed query keys)
  tests/
    e2e/                    Playwright smoke spec + run docs
```

### New API endpoint (backend support)

Adding the frontend surfaced one gap: the host dashboard needs to read the
session queue, but the existing `GET /sessions/:id/queue` is guarded with
`GuestAuthGuard`. Added a parallel host-only read so the dashboard can
render the queue regardless of any guest-side discipline gates:

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| GET | `/api/v1/sessions/:sessionId/host/queue` | Host JWT | Full queue with track metadata for the host who owns the session |

Implementation:

- `QueueService.listSessionForHost(sessionId, hostUserId)` calls
  `SessionService.getSession(sessionId, hostUserId)` for ownership, then
  reads `entries.listBySessionWithTrack`. Bypasses the moderation
  read-gate intentionally (the host sees everything).
- `QueueController.listForHost` wires it under the existing controller.
- `QueueModule` now imports `SpotifyAuthModule` so `HostAuthGuard` /
  `HostJwtService` are available.

### Visual + UX details

- **Theme**: zinc-950 background, neon gradient accents, success/warning/danger tones from the layout doc. Inter for body, JetBrains Mono for join codes and timestamps.
- **Motion**: queue cards animate in/out via Framer `<AnimatePresence>`. Locked rows use a 2.4s gradient halo (`animate-lock-pulse`). Token balance pops on change (`animate-token-pop`). Skeleton shimmer for loading states. `prefers-reduced-motion` zeroes durations globally.
- **Realtime bridging**: `PartySocketProvider` invalidates the right React Query keys on every WS event type (`queue.updated`, `vote.updated`, `track.locked`, `track.unlocked`, `track.queued_to_spotify`, `token.updated`, `guest.joined`, `session.*`). `now_playing.updated`, `runner.status_changed`, and `token.updated` payloads are also exposed via context for instant UI without a refetch round-trip.
- **Auth model**: host JWT stored as a single key in `localStorage`; guest JWTs are keyed by `sessionId` so a single browser can hold multiple party sessions side-by-side. `useHostAuth` and `useGuestAuth(sessionId)` hydrate after mount to stay SSR-safe.
- **OAuth handoff**: `/host/login` calls `GET /auth/spotify/login?json=1&redirectTo=<origin>/host/auth/complete`, then full-page-navigates to the returned `authorizeUrl`. After Spotify, the Supabase edge function (already deployed) bounces the browser to `WEB_AUTH_COMPLETE_URL` with `?token=…&user_id=…`. The `/host/auth/complete` page reads those, stores them, and redirects to `/host/sessions/new`.
- **Connection state**: a `<ConnectionPill>` always sits in the header showing connected / connecting / offline. Useful as a debugging affordance and a guest-facing trust signal.
- **Toasts**: a small Zustand store (`useToastStore`) drives a Radix-based Toaster. `toast({ title, description?, tone? })` from anywhere.
- **Mobile-first**: guest layout uses a 4-tab bottom nav (Home, Search, Queue, Tokens) below `sm:`, plus a fixed-top status row with display name, token balance, connection pill, and a Leave button. Host nav is a horizontally scrollable pill bar.
- **Accessibility**: every icon button has an `aria-label`. Focus rings inherit a 2px purple ring against the dark surface. WCAG-AA contrast on every text/background pair. Toggle controls use Radix Switch with keyboard semantics.

## New routes (frontend)

| Path | Audience | Notes |
| --- | --- | --- |
| `/` | All | Landing with Host / Join CTAs |
| `/join` | Guest | Accepts `?code=`/`?qrToken=` from QR scan |
| `/host/login` | Host | Connect Spotify |
| `/host/auth/complete` | Host | OAuth landing — stores JWT, redirects |
| `/host/sessions/new` | Host | Form → POST `/sessions` |
| `/host/sessions/:id/qr` | Host | QR + join code + live join counter |
| `/host/sessions/:id/devices` | Host | Devices, runner control, playback |
| `/host/sessions/:id/dashboard` | Host | Now-playing + queue + pin/veto |
| `/host/sessions/:id/settings` | Host | PATCH session settings |
| `/host/sessions/:id/moderation` | Host | Blacklists + guest discipline |
| `/party/:id` | Guest | Home: now-playing + locked rail |
| `/party/:id/search` | Guest | Spotify search → add |
| `/party/:id/queue` | Guest | Vote / boost / challenge |
| `/party/:id/wallet` | Guest | Token counters |

## Tests

- **Web Jest** (`apps/web/lib/api/client.spec.ts`): 7 cases covering envelope unwrap, query stringification, host vs. guest bearer attachment, ApiError mapping from the error envelope, fallback for non-JSON 5xx bodies, and 204 short-circuit. Added `moduleNameMapper` for `@/*` and the shared libs to the web Jest config.
- **API Jest**: updated `queue.controller.spec.ts` to provide `HostAuthGuard` + `HostJwtService` and added three cases on `/sessions/:id/host/queue` (no token / guest token / host token). Added a `QueueService.listSessionForHost` unit test (ownership check + bypass of `assertGuestCanReadQueue`). Full API suite: 432/432 passing.
- **Playwright smoke**: `apps/web/tests/e2e/landing.spec.ts` covers landing CTAs, `/host/login` Connect button, and `/join?code=` query prefill. Run docs in `tests/e2e/README.md`. Config supports `PLAYWRIGHT_USE_DEV=1` for hot-reload and `PLAYWRIGHT_FULL_MATRIX=1` for cross-browser. The chromium binary download is not run in this milestone.

## Deferred / intentionally out of scope

- **Full Playwright matrix** (host-create → guest-join → search → add → vote → boost → lock → challenge → veto → runner status). Needs a dev fixture endpoint to mint host JWTs or a recorded Spotify OAuth HAR. Tracked as a follow-up alongside the dev stack docs.
- **PWA install / manifest / offline shell** — nice-to-have, not on the M17 checklist.
- **Sentry / OTel / Prometheus** wiring on the web app — M18 observability.
- **Real payments / paid tokens** — explicitly excluded by the master plan.
- **Host-side guest list UI** with mute/ban inline. Today the moderation page accepts a guest UUID by paste. Inline action will come once the host queue cards expose `addedByGuestId` with a friendly display name (needs a small backend join).

## How to run

```bash
# One-time
npm install                # picks up React 18 overrides
npm --workspace @fairplay/web run test:e2e:install  # only if running Playwright

# Dev (3 terminals)
npm run docker:up          # Postgres + Redis
npm run dev:api            # http://localhost:3000
npm run dev:web            # http://localhost:3001

# Build
npm --workspace @fairplay/web run build

# Tests
npm --workspace @fairplay/api test
npm --workspace @fairplay/web test
npm --workspace @fairplay/web run build && npm --workspace @fairplay/web run test:e2e
```

## Env vars added

`apps/web` reads these (defaults shown), all `NEXT_PUBLIC_*` so they ship to the browser:

| Var | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3000/api/v1` | REST root for the API client |
| `NEXT_PUBLIC_REALTIME_URL` | `http://localhost:3000` | Socket.IO origin for the `/party` namespace |

On the Supabase edge function side, `WEB_AUTH_COMPLETE_URL` should be set
to `<web-origin>/host/auth/complete` so OAuth completes back into the app.

## Verification

- `tsc --noEmit` on `apps/web/tsconfig.json` — clean.
- `next build` — clean. 16 routes generated, mix of static and dynamic.
- `npm --workspace @fairplay/api test` — 432 / 432.
- `npm --workspace @fairplay/web test` — 7 / 7.
