# Codex continuation prompt

Paste the block below into Codex. It's tight on purpose — Codex will read
the linked docs when it needs depth.

---

You're picking up the FairPlay DJ project from another agent.
Repo: this one. Branch: `main`. Read `03_milestones/HANDOFF_TO_CODEX.md`
first — it's a dense 1-page status and lists what's broken.

**Stack:** Nx monorepo. `apps/api` (NestJS), `apps/runner`, `apps/web`
(Next.js 14 App Router, Tailwind, shadcn-style primitives, Framer Motion,
TanStack Query, socket.io-client). Backend deployed on Railway at
`https://api-production-7ee5.up.railway.app/api/v1`. Local web runs on
:3001 and points at the deployed API via `apps/web/.env.local` (already
configured).

**Immediate task:**

1. Start the dev server:
   `npm --workspace @fairplay/web run dev`
2. Ask the user to **hard-refresh** (Cmd+Shift+R) the QR and Settings
   pages. A commit `3769683` just switched all dynamic pages from
   `useParams()` to the App Router params-prop pattern, which should fix
   the `/api/v1/sessions/undefined → 400 VALIDATION_FAILED` errors they
   reported. If the bundle was cached, the user may still be on the old
   code.
3. If still broken after hard refresh, follow the diagnostic ladder in
   `HANDOFF_TO_CODEX.md` → "If the fix didn't actually solve it". Do not
   add `console.log`s before checking the URL bar + DevTools Network tab.

**Constraints:**

- Don't run integration tests. Don't run Playwright (chromium isn't
  installed and downloading it is ~150 MB).
- Don't bump the React version — there are root `overrides` in
  `package.json` pinning 18.3.x to dedupe `@nx/react`'s React 19. Touching
  this breaks `next build`.
- Don't change Railway env or redeploy unless asked. The current Railway
  build already has M16 + M17 backend.
- Spotify is rate-limited on `getDevices` for ~6h (`retryAfterSec=22513`).
  Empty device list is expected; not your bug.

**Style:** match the existing milestone handoff docs
(`03_milestones/HANDOFF_MILESTONE_*.md`) for tone — terse, code-level,
"what / why / verification" sections. The user prefers proactive
verification over questions when the next step is obvious.

**When you finish a chunk of work:** make a normal git commit with a
Conventional-Commit-ish subject ("M17 fix-up: ..." style is fine) and a
`Co-Authored-By:` trailer matching the existing commits if the user
asked you to keep the pattern.

Start by reading `03_milestones/HANDOFF_TO_CODEX.md` end-to-end (it's <120
lines). Then jump to step 1.
