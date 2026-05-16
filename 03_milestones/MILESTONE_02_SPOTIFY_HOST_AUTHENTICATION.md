# Milestone 02 — Spotify Host Authentication


## Goal

Allow a host to authenticate with Spotify using Authorization Code with PKCE and store refresh tokens securely.

## Build Scope

Create modules:

```text
SpotifyAuthModule
SpotifyTokenModule
```

Create services:

```text
SpotifyAuthService
SpotifyTokenService
TokenEncryptionService
```

Create persistence:

```text
users
spotify_tokens
```

## APIs

```http
GET /api/v1/auth/spotify/login
GET /api/v1/auth/spotify/callback
POST /api/v1/auth/spotify/logout
GET /api/v1/auth/spotify/status
```

## Spotify Scopes

```text
user-read-playback-state
user-read-currently-playing
user-modify-playback-state
```

## Security Rules

- Do not expose access tokens to frontend.
- Encrypt refresh tokens at rest.
- Do not log OAuth code.
- Do not log tokens.
- Validate OAuth state.

## Tests

- PKCE verifier/challenge generated correctly.
- Login URL includes correct scopes.
- Callback exchanges code for token using mocked Spotify.
- Refresh token is encrypted before storing.
- Logout removes token.
- Status returns connected/disconnected.

## Transition to Milestone 3

Once host auth works, device control can use the stored Spotify token.



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
Implement Milestone 2: Spotify Host Authentication.

Use Authorization Code with PKCE.
Create SpotifyAuthService, SpotifyTokenService, and TokenEncryptionService.

Add endpoints:
GET /api/v1/auth/spotify/login
GET /api/v1/auth/spotify/callback
POST /api/v1/auth/spotify/logout
GET /api/v1/auth/spotify/status

Required scopes:
user-read-playback-state
user-read-currently-playing
user-modify-playback-state

Persist encrypted refresh tokens.
Never expose or log Spotify tokens.
Use mocked Spotify in tests.
```
