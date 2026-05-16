# Source Notes and External Constraints

These notes summarize the external Spotify constraints that influenced the implementation.

## Spotify Web API Rules Used by This Project

- Add Item to Playback Queue works only for Spotify Premium users.
- Add Item to Playback Queue requires OAuth scope `user-modify-playback-state`.
- Spotify warns that order of execution is not guaranteed when using Add-to-Queue with other Player API endpoints.
- Spotify warns that the platform cannot be used to develop commercial streaming integrations.
- Rate-limited calls return HTTP 429 and should respect the Retry-After header.
- Authorization Code with PKCE is the recommended flow for public clients or clients where a secret cannot safely be stored.

## Useful Official Links

- Add Item to Playback Queue: https://developer.spotify.com/documentation/web-api/reference/add-to-queue
- Rate Limits: https://developer.spotify.com/documentation/web-api/concepts/rate-limits
- Authorization Code with PKCE: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- Spotify Web API overview: https://developer.spotify.com/documentation/web-api

## Product Consequence

Because of the above, the MVP uses free session tokens instead of payments. Any future monetization must be reviewed separately.
