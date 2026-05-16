# Milestone 13 — Now Playing Sync


## Goal

Track what Spotify is currently playing and update internal queue statuses.

## Build Scope

Create:

```text
NowPlayingModule
NowPlayingService
PlaybackPoller
```

## Spotify APIs

```http
GET /v1/me/player
GET /v1/me/player/currently-playing
```

## Status Transitions

```text
QUEUED_TO_SPOTIFY -> PLAYING -> PLAYED
```

## Edge Cases

- Host manually skips.
- Host plays a song not from our app.
- Spotify paused.
- No active device.
- Track unavailable.
- Runner queued a song but Spotify did not play it yet.

## Tests

- Matching queued track becomes PLAYING.
- Previous PLAYING becomes PLAYED.
- Unknown track shown as external/manual.
- Paused state handled.
- No active device handled.
- WebSocket event emitted.

## Transition to Milestone 14

Now that playback state is visible, host controls can safely manage sessions.



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
Implement Milestone 13: Now Playing Sync.

Create NowPlayingModule, NowPlayingService, PlaybackPoller.

Poll Spotify playback state and update:
QUEUED_TO_SPOTIFY -> PLAYING
PLAYING -> PLAYED

Handle:
- manually skipped songs
- unknown Spotify tracks
- paused playback
- no active device

Emit now_playing.updated event.
Add mocked Spotify tests.
```
