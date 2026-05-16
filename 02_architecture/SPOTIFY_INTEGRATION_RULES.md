# Spotify Integration Rules

## Core Rules

1. Only the host authenticates with Spotify.
2. Guests never authenticate with Spotify.
3. Guests never directly call Spotify.
4. The backend controls playback only through the host's token.
5. The host must have Spotify Premium for playback control.
6. The app does not stream audio.
7. The app does not sell playback.
8. The internal queue is source of truth.
9. Spotify queue is a short output buffer.
10. The runner should push only 1–2 tracks ahead.

## OAuth

Use Authorization Code with PKCE.

Required scopes:

```text
user-read-playback-state
user-read-currently-playing
user-modify-playback-state
```

## Spotify APIs

### Search Tracks

```http
GET /v1/search?type=track&q={query}
```

Use for metadata discovery only.

### Get Available Devices

```http
GET /v1/me/player/devices
```

Use to let host choose the target playback device.

### Get Playback State

```http
GET /v1/me/player
```

Use to determine active device, progress, playing status.

### Get Currently Playing

```http
GET /v1/me/player/currently-playing
```

Use for now-playing synchronization.

### Transfer Playback

```http
PUT /v1/me/player
```

Use when host selects a target device.

### Add Item to Queue

```http
POST /v1/me/player/queue?uri={spotifyUri}&device_id={deviceId}
```

Use only from the runner, not from guest actions.

### Optional Host Controls

```http
POST /v1/me/player/next
PUT /v1/me/player/pause
PUT /v1/me/player/play
```

Use only from host actions.

## Rate Limit Handling

On HTTP 429:

1. Read `Retry-After`.
2. Stop Spotify calls for that host/session until retry time.
3. Continue accepting internal votes/suggestions.
4. Broadcast runner degraded status.
5. Resume later.

## Dispatch Safety

Before calling Add-to-Queue:

- Entry status must be `PENDING`.
- Entry must not be locked.
- Entry must not already have `spotify_queued_at`.
- Runner must acquire a dispatch lock.
- Queue depth must be below threshold.
- Idempotency key must be recorded.

## Important Limitation

Spotify does not give this app full queue reorder control. Do not build features that assume arbitrary Spotify queue manipulation.

The internal queue should be displayed as the true fair queue.
Spotify's queue should be treated as a short playback buffer.
