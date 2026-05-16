# Milestone 03 — Spotify Device Control


## Goal

Let the host view available Spotify devices, select one, and transfer playback.

## Build Scope

Create:

```text
SpotifyPlaybackAdapter
SpotifyDeviceService
HostDeviceController
```

## Spotify APIs

```http
GET /v1/me/player/devices
GET /v1/me/player
PUT /v1/me/player
```

## App APIs

```http
GET /api/v1/host/spotify/devices
GET /api/v1/host/spotify/playback-state
POST /api/v1/host/spotify/device/select
```

## Required Behavior

- Refresh expired host token.
- Handle 401.
- Handle 403 non-Premium.
- Handle no active device.
- Store selected device on active session later.

For now, device selection can be stored against host profile or returned as testable state until sessions exist.

## Tests

- Devices returned from mocked Spotify.
- No devices returns empty list and friendly state.
- 403 returns `SPOTIFY_PREMIUM_REQUIRED`.
- 401 triggers refresh.
- Transfer request sends correct device ID.

## Transition to Milestone 4

After device control works, host sessions can store a selected device.



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
Implement Milestone 3: Spotify Device Control.

Create SpotifyPlaybackAdapter and SpotifyDeviceService.

Add endpoints:
GET /api/v1/host/spotify/devices
GET /api/v1/host/spotify/playback-state
POST /api/v1/host/spotify/device/select

Handle:
- expired tokens
- 401 refresh
- 403 non-premium
- no active device
- no devices available

Use mocked Spotify tests.
Do not implement queue runner yet.
```
