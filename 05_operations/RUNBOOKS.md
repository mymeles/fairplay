# Operational Runbooks

## Runner Not Adding Songs

Check:

1. Is session active?
2. Is runner enabled?
3. Does host have valid Spotify token?
4. Is host Premium?
5. Is selected device active?
6. Is Spotify queue depth already above threshold?
7. Are all top tracks locked?
8. Is circuit breaker open?
9. Are we rate-limited by Spotify?

Actions:

```text
refresh host token
ask host to open Spotify
transfer playback to selected device
disable/re-enable runner
rebuild Redis queue projection
```

## Spotify 429 Rate Limit

Symptoms:

- `spotify_api_429_total` spike.
- Runner delayed.
- Logs include `runner.spotify.rate_limited`.

Actions:

1. Honor `Retry-After`.
2. Stop runner dispatch temporarily.
3. Increase runner tick interval.
4. Reduce queue depth target.
5. Cache more search results.
6. Notify host that automatic queueing is delayed.

## Redis Outage

Actions:

1. Stop runner.
2. Keep accepting limited session operations if safe.
3. Reconnect Redis.
4. Rebuild queue projection from Postgres.
5. Restart runner.

## Postgres Outage

Actions:

1. Mark API unhealthy.
2. Stop writes.
3. Keep frontend in read-only/degraded mode if cached.
4. Recover DB.
5. Re-run migrations if necessary.
6. Validate queue consistency.

## Host Device Missing

Actions:

1. Show host device selection screen.
2. Ask host to open Spotify on target device.
3. Retry device list.
4. Transfer playback after device appears.
5. Keep internal queue active.

## Bad Guest/Troll

Actions:

1. Mute guest.
2. Remove bad queue entries.
3. Ban guest if needed.
4. Increase duplicate cooldown.
5. Disable explicit tracks.
6. Require proximity if not enabled.
