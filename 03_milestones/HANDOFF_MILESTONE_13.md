# Handoff — Milestone 13: Now-Playing Sync

## Completed

- Added `apps/api/src/app/modules/now-playing/`:
  - `NowPlayingService` — per-session reconcile. For one session per call:
    1. Validate session (skips ENDED / EXPIRED).
    2. Refresh the host's access token (one-shot 401 retry, same pattern as M12).
    3. Call `SpotifyPlaybackAdapter.getPlaybackState`.
    4. If null (204) → emit `state='no_active_device'`; if paused → emit `state='paused'`; if playing with no trackUri → emit `state='idle'`. None of these transition any rows — a paused track can resume into the same PLAYING entry.
    5. If a track is playing, look up the entry whose `track.spotifyUri` matches (across `QUEUED_TO_SPOTIFY | PENDING | LOCKED | PLAYING`).
    6. If the previous PLAYING entry is different from the match, mark it `PLAYED` before promoting the new one (we never want two PLAYING rows simultaneously).
    7. If matched, mark `PLAYING`. If not matched, emit `outcome='external_track'` with `isInternal=false` — the host is playing something outside FairPlay's queue.
    8. Publish `now_playing.updated` with full state + progressMs + deviceId.
  - `PlaybackPoller` — `OnModuleInit` starts `setInterval` at `NOW_PLAYING_TICK_MS` (default 6s). Iterates active sessions, calls `syncSession` per session, guards against overlapping ticks, gated by `NOW_PLAYING_ENABLED`.
- Extended `QueueEntryRepository` with `findPlayingBySession`, `findBySessionAndTrackUriWithTrack(sessionId, trackUri, statuses[])`, `markPlaying(entryId, playingAt?)`, `markPlayed(entryId, playedAt?)`. All txn-aware.
- Strongly typed `RealtimeEventPublisher.publishNowPlayingUpdated` with `NowPlayingUpdatedPayload`.
- Shared types: `NowPlayingState`, `NowPlayingUpdatedPayload`.
- Env: `NOW_PLAYING_ENABLED` (default `false`), `NOW_PLAYING_TICK_MS` (1500–60000, default 6000).

## Changed files

```text
README.md
apps/api/src/app/app.module.ts
apps/api/src/app/modules/config/app-config.service.ts
apps/api/src/app/modules/config/env.schema.ts
apps/api/src/app/modules/now-playing/now-playing.module.ts
apps/api/src/app/modules/now-playing/now-playing.service.spec.ts
apps/api/src/app/modules/now-playing/now-playing.service.ts
apps/api/src/app/modules/now-playing/playback-poller.spec.ts
apps/api/src/app/modules/now-playing/playback-poller.ts
apps/api/src/app/modules/queue/queue-entry.repository.ts
apps/api/src/app/modules/realtime/realtime-event-publisher.ts
libs/shared-types/src/realtime.ts
```

## Status state machine (after M13)

```text
PENDING ──(runner)──▶ QUEUED_TO_SPOTIFY ──(now-playing match)──▶ PLAYING ──(next track)──▶ PLAYED
                                              │
                                              └──(skipped/never queued)──▶ stays QUEUED_TO_SPOTIFY (visible as historical)
```

Edge cases the service handles explicitly:

| Spotify state | Match? | Previous PLAYING? | Outcome |
| --- | --- | --- | --- |
| Playing internal track | yes (status=QUEUED_TO_SPOTIFY) | none | `transitioned_playing` |
| Playing internal track | yes | different | `completed_previous` (old → PLAYED, new → PLAYING) |
| Playing internal track | yes (status=PLAYING already) | same | `no_change` (still publish for progress) |
| Playing internal track | yes (status=PENDING/LOCKED) | any | promoted straight to PLAYING |
| Playing external/manual | no | none | `external_track`, `isInternal=false` |
| Playing external/manual | no | yes | previous → PLAYED, `external_track` |
| Paused | – | – | `paused`, no DB write |
| 204 no active device | – | – | `no_active_device`, no DB write |
| Playing but trackUri null | – | – | `idle` |
| Spotify 401 | – | – | one-shot token refresh + retry; persistent → `host_disconnected` |
| Spotify 429 / 5xx | – | – | `spotify_unavailable`, no publish |

## Realtime payload

```ts
interface NowPlayingUpdatedPayload {
  sessionId: SessionId;
  state: 'playing' | 'paused' | 'idle' | 'no_active_device';
  trackUri: string | null;
  entryId: QueueEntryId | null;     // null for external/manual tracks
  isInternal: boolean;              // true iff trackUri matched a FairPlay entry
  progressMs: number | null;
  deviceId: string | null;
}
```

UIs can drive a "now playing" tile from this single event. The poller publishes on every tick (even no-op) so clients reconnecting always have fresh progressMs.

## Env vars

| Var | Default | Notes |
| --- | --- | --- |
| `NOW_PLAYING_ENABLED` | `false` | Must be `true` for the poller to tick. Production: on. |
| `NOW_PLAYING_TICK_MS` | `6000` | Interval between polls. Min 1500ms to respect Spotify's ~1 req/sec/token limit. |

## Tests added

17 new API tests (355 total):

- `now-playing.service.spec.ts` (13) — transition to PLAYING; previous → PLAYED on track change; idempotent no-change publish; external/manual track with previous completion; PENDING/LOCKED promoted to PLAYING when host plays manually; paused; no_active_device (Spotify 204); idle (playing but no trackUri); 401 token refresh + retry; persistent UNAUTHORIZED → host_disconnected; 429 → spotify_unavailable; session no longer joinable → idle.
- `playback-poller.spec.ts` (5) — iterate active sessions; count `completed_previous` as a transition; per-session failure isolation; disabled-by-env skips timer; overlapping ticks skipped.

```text
NX_DAEMON=false npx nx build @fairplay/api --skip-nx-cache  ✅
NX_DAEMON=false npx nx test  @fairplay/api --skip-nx-cache  ✅ 355/355 (338 prior + 17 new)
NX_DAEMON=false npx nx lint  @fairplay/api --skip-nx-cache  ✅ (1 pre-existing main.ts console warning)
```

## Manual verification

After deploy with `NOW_PLAYING_ENABLED=true`, `NOW_PLAYING_TICK_MS=6000`, and the M12 runner also on:

- `GET /health`, `/health/db`, `/health/redis` all `ok` after the deploy stabilized.
- API survived 100+ seconds of soak (uptime stabilized at 95s after a brief Railway restart sequence on env var update + redeploy, then stayed up). That covers ~16 now-playing ticks plus ~20 runner ticks running concurrently across all active sessions — no crash path in either tick.

End-to-end live smoke (needs a real Spotify-connected host with an active device):

1. Start Spotify on a device.
2. Open the local UI, log in, select that device.
3. Create a session, join as a guest, add a track.
4. Wait one runner tick (≤ 5s) — the track appears in the host's Spotify queue (M12).
5. Skip Spotify's currently-playing track or let it advance to the queued one.
6. Within one now-playing tick (≤ 6s), the FairPlay entry moves to `PLAYING`. Watch for the `now_playing.updated` event with `state='playing'`, `isInternal=true`, `entryId=…`.
7. When Spotify advances past it, the next tick fires `now_playing.updated` for the new track and the old entry transitions to `PLAYED`.
8. Play a song manually from Spotify that isn't in the queue → `now_playing.updated` with `isInternal=false` and `entryId=null`.

## Known risks / limitations

- **Single-process state.** Like M12, the poller runs in the API process. If you scale `api` horizontally, multiple replicas will all poll the same host token; you'd want a leader election (Redis lock similar to the runner's dispatch lock) or pinning to one replica.
- **Polling, not push.** Spotify doesn't push playback events. 6s freshness is the floor without going into rate-limit territory. M20 load testing should confirm this is fine at the target scale.
- **External tracks aren't reified.** When the host plays something outside FairPlay, we just emit `isInternal=false` — no row is created. The UI can show "Now playing (manual): trackUri" but can't display artwork/title without an extra Spotify track fetch, which we don't do today.
- **No clamp on PLAYING duration.** If Spotify gets stuck and reports `isPlaying=true` indefinitely, the entry stays PLAYING. Acceptable for MVP; a watchdog (PLAYING ages > 2× duration → PLAYED) is a future hardening.

## Deployment

```text
Railway env update:  NOW_PLAYING_ENABLED=true, NOW_PLAYING_TICK_MS=6000
Railway deploy:      6b58553e-14d2-4b1c-80e0-b43eb79a2c1b           ✅
GET /health                                                         ✅ status=ok, uptime=106s
GET /health/db                                                      ✅ postgres ok
GET /health/redis                                                   ✅ redis ok
Process survived 100+ seconds with both the runner (M12) and the
now-playing poller (M13) ticking concurrently — no crashes.
```

## Next milestone

Milestone 14 — Host Controls.

M13 closes the playback lifecycle, so M14 can safely expose host endpoints:

- `POST /sessions/:id/runner/enable` / `disable` — wraps `RunnerStateService.enable/disable`.
- `POST /queue/:id/pin` / `unpin` — uses the `hostPinned` flag already on `queue_entries` and re-triggers `ScoreRebuildService.recalculateEntry`.
- `POST /queue/:id/veto` — already partially supported by `LockWindowService.vetoEntry`; M14 will expose it via a host-only controller path.
- `POST /sessions/:id/skip` — wraps `SpotifyPlaybackAdapter` skip-to-next + lets the M13 poller catch up.
