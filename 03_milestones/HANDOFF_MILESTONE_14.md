# Handoff — Milestone 14: Host Controls

## Completed

- Added `apps/api/src/app/modules/host-control/`:
  - `HostControlService` — `pinEntry / unpinEntry` (flip `host_pinned`, call `ScoreRebuildService.recalculateEntry` so the M09 formula's `hostPinWeight=1000` immediately reflects), `startRunner / stopRunner` (delegates to `RunnerStateService` from M12; uses reason `host_disabled` for stop). Ownership is verified by calling `SessionService.getSession(sessionId, hostUserId)` which throws `FORBIDDEN/NOT_FOUND`.
  - `SessionSettingsService` — partial-PATCH that loads current settings, shallow-merges top-level keys, deep-merges the `scoring` block, persists via `SessionRepository.updateSettings`, and publishes `session.updated`. Skips explicit-undefined keys so a class-validator DTO with all-optional fields can't blow away configured values.
  - `UpdateSessionSettingsDto` — class-validator partial. Each field has bounds matching `DEFAULT_SESSION_SETTINGS`; `forbidNonWhitelisted` rejects unknown fields.
  - `HostQueueController` — `POST /api/v1/queue/:entryId/pin` + `unpin`, host-only.
  - `HostRunnerController` — `POST /api/v1/sessions/:id/runner/start` + `stop`, `PATCH /api/v1/sessions/:id/settings`, host-only.
- Extended `SpotifyPlaybackAdapter` with `skipToNext`, `pause`, `resume`. All three POST/PUT against `/v1/me/player/{next,pause,play}` with an optional `device_id` query param, return 204 on success, and map 404 → `SPOTIFY_NO_ACTIVE_DEVICE` (the same code the M12 runner produces so the UI can react uniformly).
- Extended `SpotifyDeviceService` with `skip / pause / resume` methods that resolve the host's `selectedDeviceId` and call the adapter through the same `callWithAuthRetry` path used elsewhere.
- Extended `HostDeviceController` with `POST /host/spotify/{skip,pause,resume}`, host-only.
- Extended repositories:
  - `QueueEntryRepository.setHostPinned(entryId, pinned, tx?)`.
  - `SessionRepository.updateSettings(sessionId, settings)`.
- Extended shared types: `QueueUpdatedPayload.reason` now includes `'host_pinned' | 'host_unpinned'`.
- Veto endpoint (`POST /queue/:entryId/veto`) was already exposed in M10's `LockWindowController`. M14 reuses it as-is; no second implementation.

## New / changed endpoints

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| POST | `/api/v1/queue/:entryId/pin` | Host JWT | flips `host_pinned=true`, recalc score, publishes `queue.updated{reason:host_pinned}` |
| POST | `/api/v1/queue/:entryId/unpin` | Host JWT | flips `host_pinned=false`, recalc score, publishes `queue.updated{reason:host_unpinned}` |
| POST | `/api/v1/sessions/:id/runner/start` | Host JWT | `RunnerStateService.enable(sessionId)`, publishes `runner.status_changed` |
| POST | `/api/v1/sessions/:id/runner/stop` | Host JWT | `RunnerStateService.disable(sessionId, 'host_disabled')`, publishes `runner.status_changed` |
| PATCH | `/api/v1/sessions/:id/settings` | Host JWT | merges partial settings, persists, publishes `session.updated` |
| POST | `/api/v1/host/spotify/skip` | Host JWT | `Spotify POST /me/player/next` with selected device |
| POST | `/api/v1/host/spotify/pause` | Host JWT | `Spotify PUT /me/player/pause` with selected device |
| POST | `/api/v1/host/spotify/resume` | Host JWT | `Spotify PUT /me/player/play` with selected device |

## Status codes

| Code | When |
| --- | --- |
| 200 | success on all M14 endpoints |
| 400 | malformed UUID, invalid settings (bounds violation), unknown setting key |
| 401 | missing/invalid host JWT |
| 403 | host doesn't own the session that contains the entry/session |
| 404 | unknown entry, or Spotify reports no active device (skip/pause/resume) |
| 409 | pin/unpin on a `PLAYED/REMOVED/VETOED/QUEUED_TO_SPOTIFY/PLAYING` entry |
| 429 | Spotify rate-limited the playback call |
| 502 | Spotify upstream error |

## Changed files

```text
README.md
apps/api/src/app/app.module.ts
apps/api/src/app/modules/host-control/dto/update-session-settings.dto.ts
apps/api/src/app/modules/host-control/host-control.controllers.spec.ts
apps/api/src/app/modules/host-control/host-control.module.ts
apps/api/src/app/modules/host-control/host-control.service.spec.ts
apps/api/src/app/modules/host-control/host-control.service.ts
apps/api/src/app/modules/host-control/host-queue.controller.ts
apps/api/src/app/modules/host-control/host-runner.controller.ts
apps/api/src/app/modules/host-control/session-settings.service.spec.ts
apps/api/src/app/modules/host-control/session-settings.service.ts
apps/api/src/app/modules/queue/queue-entry.repository.ts
apps/api/src/app/modules/sessions/session.repository.ts
apps/api/src/app/modules/spotify-playback/host-device.controller.ts
apps/api/src/app/modules/spotify-playback/spotify-device.service.ts
apps/api/src/app/modules/spotify-playback/spotify-playback-controls.adapter.spec.ts
apps/api/src/app/modules/spotify-playback/spotify-playback.adapter.ts
libs/shared-types/src/realtime.ts
```

## Database / Redis changes

- **No DB migration.** All M14 actions update existing columns: `queue_entries.host_pinned` (added in M07), `party_sessions.settings_json`. The realtime publisher already existed.
- No new Redis keys.

## Realtime events fired by M14

- `queue.updated` with `reason='host_pinned'` or `'host_unpinned'` (entry id + status).
- `runner.status_changed` (via `RunnerStateService` — same publisher path as M12).
- `session.updated` with `{ sessionId, settings }`.

## Tests added

31 new API tests (386 total):

- `host-control.service.spec.ts` (8) — pin happy path + recalc + publish; pin idempotency; unknown entry → 404; ownership forwarded as 403; refuse PLAYED status; unpin happy path; startRunner ownership + enable; stopRunner; runner toggle FORBIDDEN.
- `session-settings.service.spec.ts` (5) — shallow merge; deep `scoring` merge keeps unspecified weights; publishes `session.updated`; ownership forwarded as 403; skips explicit-undefined.
- `host-control.controllers.spec.ts` (12) — pin 401/400/happy; unpin happy; runner start/stop 401/happy; settings PATCH 401/400-bound/400-unknown-field/happy with scoring patch passed through.
- `spotify-playback-controls.adapter.spec.ts` (6) — skipToNext verb + path + device_id; pause without device_id; resume with device_id; 404 → SPOTIFY_NO_ACTIVE_DEVICE; 401 → SPOTIFY_AUTH_FAILED; 429 with retryAfterSec.

```text
NX_DAEMON=false npx nx build @fairplay/api --skip-nx-cache  ✅
NX_DAEMON=false npx nx test  @fairplay/api --skip-nx-cache  ✅ 386/386 (355 prior + 31 new)
NX_DAEMON=false npx nx lint  @fairplay/api --skip-nx-cache  ✅ (1 pre-existing main.ts console warning)
```

## Manual verification

Auth-gate smoke against the live deploy with bogus UUIDs and no `Authorization` header:

| Endpoint | HTTP |
| --- | --- |
| `POST /queue/:id/pin` | 401 ✅ |
| `POST /queue/:id/unpin` | 401 ✅ |
| `POST /sessions/:id/runner/start` | 401 ✅ |
| `POST /sessions/:id/runner/stop` | 401 ✅ |
| `PATCH /sessions/:id/settings` | 401 ✅ |
| `POST /host/spotify/skip` | 401 ✅ |
| `POST /host/spotify/pause` | 401 ✅ |
| `POST /host/spotify/resume` | 401 ✅ |
| `POST /queue/:id/veto` (M10, sanity check) | 401 ✅ |

API uptime stabilized at 93s after the deploy — that covers ~18 runner ticks (M12) + ~15 now-playing ticks (M13) running concurrently with the new code, so the bootstrap path of `HostControlModule` is clean.

Full end-to-end test (real host JWT + active Spotify device):

1. Open the local UI, log in, select a device.
2. Create a session, add a track.
3. `POST /queue/:id/pin` with the host JWT → response shows `hostPinned: true, score: ~1000`; realtime listeners get `queue.updated{reason:host_pinned}` and the entry jumps to the top of the queue.
4. `POST /sessions/:id/runner/stop` → realtime `runner.status_changed{state:DISABLED, reason:host_disabled}`. Adding more tracks no longer triggers dispatch.
5. `POST /sessions/:id/runner/start` → status returns to IDLE; the next runner tick dispatches the top entry.
6. `PATCH /sessions/:id/settings` with `{"lockSize": 4}` → `session.updated` fires; the next lock-window tick locks up to 4 entries.
7. `POST /host/spotify/pause` → Spotify pauses; M13's next tick emits `now_playing.updated{state:paused}`.
8. `POST /host/spotify/resume` → Spotify resumes; `now_playing.updated{state:playing}` resumes.
9. `POST /host/spotify/skip` → Spotify advances; M13 transitions the current `PLAYING` entry to `PLAYED` and matches the new one.

## Known risks / limitations

- **Pin + recalc is two writes.** `setHostPinned` then `recalculateEntry` are independent UPDATEs. A concurrent vote between them sees the new flag (good) but might race the recalc's `setScore` (it'd overwrite the vote's score). Acceptable for MVP because votes immediately call `scoring.calculate` themselves; the worst case is one stale score for ≤6s until the next now-playing or runner tick observes it.
- **Settings PATCH races concurrent mutations.** The merge reads `getSession` then writes the merged blob — two simultaneous PATCHes can clobber each other. Acceptable because host settings updates are rare; if it becomes an issue, wrap in `prisma.$transaction` with a `SELECT … FOR UPDATE`.
- **No per-session runner override flag in Postgres.** `RunnerStateService.disable` is in-memory only — restarting the API process resets every session back to enabled. M19/M20 hardening should add a `party_sessions.runner_enabled` column if you want host-set disables to survive restarts.
- **Spotify skip/pause/resume don't update internal state.** A host who pauses via the FairPlay endpoint will see the next now-playing tick (M13) catch the pause and emit `now_playing.updated{state:paused}` — there's no separate publish from the controller. Same for skip: the runner's pending → QUEUED_TO_SPOTIFY transitions still feed M13.
- **Tier check.** None of the playback control endpoints verify the host is on Spotify Premium up-front. A non-Premium token will get a `SPOTIFY_PREMIUM_REQUIRED` (403) from the adapter; that's the same shape M03's `SpotifyDeviceService.selectDevice` returns, so the UI can branch on it.

## Deployment

```text
Railway deploy:    3c69c493-52be-4712-a19e-524963e2e0a5           ✅
GET /health                                                       ✅ status=ok
All 8 new M14 endpoints + M10's veto                              ✅ 401 unauthenticated
Process survived 93+ seconds with M12 + M13 + new M14 modules     ✅ no crashes
```

## Next milestone

Milestone 15 — Session Token Economy.

M14 leaves three obvious hooks for M15:
1. Settings already include `initialBoostTokens` + `initialChallengeTokens`; M15 just needs to grant them at join + manage spends.
2. The realtime publisher already has `publishTokenUpdated` (used by M10 for challenge token spends). M15 expands the `reason` enum.
3. `guest_wallets` table exists since M04. The `token_ledger` table from the data-model doc is the M15 schema add.
