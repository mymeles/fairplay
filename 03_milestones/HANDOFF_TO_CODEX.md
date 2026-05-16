# Handoff to Codex

Short, dense status doc. Pair with `CODEX_PROMPT.md` (next door) for the
actual continuation prompt to paste.

## Where we are

**Branch:** `main` (local, no remote configured)
**Last 4 commits:**

```
3769683 M17 fix-up: params-prop + clearer error UX
9d6b89e Milestone 17: frontend MVP
fbfb68d Milestone 16: moderation and abuse protection
3cd67b4 Complete host controls and token economy
```

- M16 (moderation) + M17 (frontend MVP) **both shipped to Railway** today
  (`api-production-7ee5.up.railway.app`). All M16/M17 endpoints respond 401
  (not 404) without a host JWT — routes confirmed live.
- Repo has full handoff docs at `03_milestones/HANDOFF_MILESTONE_16.md` and
  `HANDOFF_MILESTONE_17.md`.

## Local dev setup (already in place)

- `apps/web/.env.local` points at deployed Railway:
  ```
  NEXT_PUBLIC_API_BASE_URL=https://api-production-7ee5.up.railway.app/api/v1
  NEXT_PUBLIC_REALTIME_URL=https://api-production-7ee5.up.railway.app
  ```
- `npm --workspace @fairplay/web run dev` → http://localhost:3001
- Railway CORS already allows `http://localhost:*` (verified).
- Spotify OAuth bounces correctly to `http://localhost:3001/host/auth/complete`
  via the API's `redirectTo` param to the Supabase edge function.

## What's broken right now (open issue)

**Symptom:** user reports the QR and Settings pages keep "failing on
validation" — browser console showed
`/api/v1/sessions/undefined → 400 VALIDATION_FAILED` four times in a row.

**Likely cause (already fixed in commit `3769683`):** all 9 dynamic-segment
pages were using `useParams<{ sessionId: string }>()` from `next/navigation`.
In Next.js 14 client components, `useParams()` can return an empty object
during the first render, so `params.sessionId` is `undefined` and gets
interpolated into the URL as the literal string `"undefined"`.

**Fix applied:** switched every page under `[sessionId]` to the App Router
prop pattern:

```tsx
export default function HostQrPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  ...
}
```

Pages touched (all in `apps/web/app/`):

- `host/sessions/[sessionId]/qr/page.tsx`
- `host/sessions/[sessionId]/settings/page.tsx`
- `host/sessions/[sessionId]/dashboard/page.tsx`
- `host/sessions/[sessionId]/devices/page.tsx`
- `host/sessions/[sessionId]/moderation/page.tsx`
- `party/[sessionId]/page.tsx`
- `party/[sessionId]/search/page.tsx`
- `party/[sessionId]/queue/page.tsx`
- `party/[sessionId]/wallet/page.tsx`

Also added explicit error cards to QR + Settings (and queue card on
Dashboard) so the next failure shows `code — message + Retry` instead of a
forever spinner.

**User has not yet hard-refreshed since the fix landed.** First step for
Codex: ask the user to do `Cmd+Shift+R` on the QR or Settings page (Fast
Refresh + bundle caching means a soft reload can keep the broken bundle
loaded).

## If the fix didn't actually solve it

Diagnostic steps in order, cheapest first:

1. Open browser DevTools → Network tab on the QR page. The failing request
   is `GET /api/v1/sessions/<id>`. Look at the path:
   - `/sessions/undefined` → params prop is still empty. Look at React
     DevTools, inspect the page component, check the `params` prop value.
   - `/sessions/<real-uuid>` → host JWT must be the issue. Check
     `Authorization` header on the request.
   - `/sessions/<real-uuid>` returning 403 → host doesn't own this session;
     they probably logged in as a different host than the one who created it.
     Clear `fairplay.host.jwt` from localStorage and re-do the OAuth flow.
2. Compare the URL bar — if `/host/sessions/<id>/qr` shows `<id>` as a UUID,
   Next.js routed correctly and `params.sessionId` MUST be that UUID.
3. If still ambiguous: `console.log(params)` at the top of `HostQrPage` and
   compare with the URL.

## Other notes worth knowing

- **Spotify is rate-limiting the deployed API on `getDevices`** —
  `retryAfterSec=22513` (~6h) at last check. Devices page won't list
  anything until that clears. Unrelated to QR/Settings bug.
- A `local-test-ui` directory was removed in M16. The user kept hitting
  `/guest?code=...` (a leftover bookmark). Added `apps/web/app/guest/page.tsx`
  that 302s to `/join` preserving the query. No more 404s.
- Backend gap closed during M17: `GET /sessions/:id/host/queue` (host JWT)
  for the dashboard queue read. Tests added.
- Workspace had React 18/19 duplicates from `@nx/react` (transitive via
  `@nx/next`); resolved with root `overrides` in `package.json` pinning
  React 18.3.x. Touching that breaks `next build` with a "two copies of
  React" hooks crash.

## Verification commands that pass right now

```bash
npx tsc -p apps/web/tsconfig.json --noEmit          # 0 errors
npm --workspace @fairplay/web test                   # 7/7
npm --workspace apps/api test                        # 432/432
cd apps/web && npx next build                        # 16 routes built
```

## What to do next (rough order)

1. Confirm the params-prop fix solved QR + Settings (hard refresh).
2. Walk through the rest of the host flow: dashboard, devices (will warn
   about Spotify rate limit), settings save, moderation (paste a guest UUID,
   try mute → unmute).
3. Walk through guest flow in incognito: `/join?code=<JOIN_CODE>` → name →
   join → search → add → vote → boost.
4. End-to-end: host runner start → guest adds tracks → top track locks
   (`animate-lock-pulse`) → runner dispatches to Spotify → `now_playing`
   pulses across both windows.
5. Polish: anything ugly under reduced-motion, anything weird on iPhone
   viewport (`PLAYWRIGHT_FULL_MATRIX=1 npm run test:e2e` once chromium is
   installed).
