# Milestone 06 — Track Search and Normalization


## Goal

Allow guests to search Spotify tracks and normalize them into internal Track DTOs.

## Build Scope

Create:

```text
TrackModule
TrackSearchService
SpotifySearchAdapter
TrackNormalizer
```

Table:

```text
tracks
```

## API

```http
GET /api/v1/sessions/:sessionId/search?q=...
POST /api/v1/tracks/normalize
```

## Track DTO

```ts
{
  spotifyUri: string;
  spotifyTrackId: string;
  title: string;
  artist: string;
  album?: string;
  durationMs: number;
  artworkUrl?: string;
  explicit: boolean;
}
```

## Rules

- Use host token for Spotify Search.
- Cache query results in Redis for short TTL.
- Respect explicit content session setting.
- Empty query rejected.
- No queue entry created here.

## Tests

- Search returns normalized tracks.
- Empty query rejected.
- Explicit tracks filtered when disabled.
- Spotify 401 refreshes token.
- Spotify 429 uses backoff handling.

## Transition to Milestone 7

Once tracks can be normalized, guests can add them to internal queue.



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
Implement Milestone 6: Track Search and Normalization.

Create TrackModule, TrackSearchService, SpotifySearchAdapter, TrackNormalizer.

Endpoints:
GET /api/v1/sessions/:sessionId/search?q=
POST /api/v1/tracks/normalize

Normalize Spotify results into TrackDto.
Cache search results in Redis.
Use mocked Spotify tests.
Do not create queue entries yet.
```
