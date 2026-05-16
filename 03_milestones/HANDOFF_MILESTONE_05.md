# Handoff — Milestone 05: Proximity Gate

## Architectural change vs. the original milestone doc

The doc lists five signals. We kept the same five and the same weights/threshold (40/25/25/30/10, threshold 50). One mechanical addition vs. the doc: the join request now also carries an optional **`wifiHash`** field on `JoinSessionDto`, and the session can carry an optional `venueWifiHash` (added via M05 migration). Without those, the proximity score still computes — the corresponding signal just contributes 0.

The proximity gate runs **after** the proof verification (joinCode/qrToken) so an attacker who only knows the venue's GPS still can't join. The order is: load joinable session → verify proof → score proximity → admit-or-block → create guest+wallet+JWT.

The decision rule is exactly what the doc requires: when `proximityRequired=false` (default), the score is **logged only** and the join is always permitted; when `=true`, the score must reach the 50 threshold or the request is rejected with `FORBIDDEN` and the reasons are returned in `details`.

## Completed

- **Migration `m05_proximity_gate.sql`** applied to Supabase project `zgublzgoejdzexwpicvb`:
  - `party_sessions.venue_wifi_hash text` — optional opaque hex digest the host registers at session-create time. The server never sees the underlying SSID/BSSID.
- **Prisma schema** updated to add `venueWifiHash String?` on `PartySession`; `prisma generate` regenerated the client.
- **Shared types (`@fairplay/shared-types`)**:
  - `SessionVenue` — `{ lat, lng, radiusMeters }` so summaries can expose venue config without leaking the Wi-Fi hash.
  - `SessionSummary` extended with `venue: SessionVenue | null` and `hasVenueWifi: boolean` (the hash itself is never returned).
  - `JoinTrustReason` enum — every signal outcome the scorer can emit.
  - `ProximityResult` — `{ allowed, score, threshold, reasons[], distanceMeters }`.
- **`apps/api/src/app/modules/proximity/`** new module:
  - `proximity-signals.ts` — pure helpers. `haversineMeters`, `isWithinVenueRadius` (with negative-accuracy clamping so a bogus accuracy claim can't push a far-away guest into the radius), `wifiHashMatches` (constant-time via `crypto.timingSafeEqual` after a length pre-check), `isLowRiskDevice` (sha-shaped hex check; reputation is M16 work).
  - `join-trust-scorer.ts` — pure, no I/O. Exports `TRUST_SIGNAL_WEIGHTS` and `MINIMUM_REQUIRED_SCORE` so the doc-pinned values are visible at one place. Builds the reasons list whether the signal contributed or not (so logs explain `gpsMissing`/`noVenueGps`/`gpsOutsideRadius` distinctly).
  - `proximity.service.ts` — orchestrates: builds `TrustSignals`, calls the scorer, **logs at INFO** with `{score, threshold, allowed, reasons, distanceMeters, accuracyMeters, proximityRequired}`. Privacy: never logs raw lat/lng or Wi-Fi hashes. Forces `allowed=true` in advisory mode regardless of score.
  - `proximity.module.ts` — exports `JoinTrustScorer` + `ProximityService`.
- **DTO updates**:
  - `CreateSessionDto` — adds `venue?: { lat, lng, radiusMeters }` (nested `class-validator` with bounded ranges) and `venueWifiHash?: string` (32–128 hex).
  - `JoinSessionDto` — adds `location?: { lat, lng, accuracyMeters }` and `wifiHash?: string`. All optional → backward-compatible with M04 callers.
- **Session repo + service** — pull/push `venueLat/Lng/RadiusMeters/WifiHash`; `Decimal → number` conversion via `Number(decimal.toString())`. `SessionService.createSession` now takes a `CreateSessionInputExtras = { settingsOverride?, venue?, venueWifiHash? }` instead of the bare `settingsOverride`. The summary returned to the host includes `venue` + `hasVenueWifi`.
- **`GuestService.joinSession`** — proof verification refactored to track `qrTokenValid` and `joinCodeValid` independently (so the scorer can reward whichever was actually valid even if both were sent). After verification, calls `ProximityService.evaluate(...)`. On block, throws `FORBIDDEN` with `details.{score, threshold, reasons}`. On allow, the response gains a `proximity` block with the full result.
- **`SessionController.create`** updated to forward the new DTO fields.
- **AppModule + GuestModule** import `ProximityModule`.

## New + changed files

```
supabase/migrations/m05_proximity_gate.sql
apps/api/prisma/schema.prisma

libs/shared-types/src/sessions.ts
libs/shared-types/src/index.ts (no change — already re-exports sessions)

apps/api/src/app/app.module.ts
apps/api/src/app/modules/proximity/proximity.module.ts
apps/api/src/app/modules/proximity/proximity-signals.ts
apps/api/src/app/modules/proximity/proximity-signals.spec.ts
apps/api/src/app/modules/proximity/join-trust-scorer.ts
apps/api/src/app/modules/proximity/join-trust-scorer.spec.ts
apps/api/src/app/modules/proximity/proximity.service.ts
apps/api/src/app/modules/proximity/proximity.service.spec.ts

apps/api/src/app/modules/sessions/dto/create-session.dto.ts
apps/api/src/app/modules/sessions/dto/join-session.dto.ts
apps/api/src/app/modules/sessions/session.repository.ts
apps/api/src/app/modules/sessions/session.service.ts
apps/api/src/app/modules/sessions/session.controller.ts
apps/api/src/app/modules/sessions/session.service.spec.ts
apps/api/src/app/modules/sessions/session.controller.spec.ts

apps/api/src/app/modules/guests/guest.module.ts
apps/api/src/app/modules/guests/guest.service.ts
apps/api/src/app/modules/guests/guest.service.spec.ts

README.md
```

## New APIs

No new endpoints. Two existing endpoints accept additional optional body fields:

### `POST /api/v1/sessions` (host JWT)

```jsonc
{
  "settings": { "proximityRequired": true },         // optional, M04
  "venue": { "lat": 40.0, "lng": -74.0, "radiusMeters": 100 }, // optional, M05
  "venueWifiHash": "<32–128 hex digest>"             // optional, M05
}
```

The response `SessionSummary` now includes:

```jsonc
{
  "venue": { "lat": 40.0, "lng": -74.0, "radiusMeters": 100 } | null,
  "hasVenueWifi": true | false
}
```

The plaintext `venueWifiHash` is **never** returned over the wire.

### `POST /api/v1/sessions/:sessionId/join` (public)

```jsonc
{
  "displayName": "Alice",
  "joinCode": "ABCD12",                              // M04
  "qrToken": "<url-safe base64>",                    // M04 (one of joinCode/qrToken required)
  "deviceHash": "<sha-shaped hex digest>",           // M04, now also used by lowRiskDevice signal
  "location": { "lat": 40.0, "lng": -74.0, "accuracyMeters": 10 }, // M05
  "wifiHash": "<32–128 hex digest>"                  // M05
}
```

Response on success — adds a `proximity` block:

```jsonc
{
  "guest":   { ... },
  "wallet":  { ... },
  "token":   "<guest JWT>",
  "sessionId": "...",
  "proximity": {
    "allowed":  true,
    "score":    65,
    "threshold": 50,
    "reasons":  ["qrTokenValid", "gpsWithinRadius", "lowRiskDevice", "wifiMissing", "joinCodeInvalid"],
    "distanceMeters": 12.4
  }
}
```

Response on block (`proximityRequired=true` and score below threshold) — `403 FORBIDDEN`:

```jsonc
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Join blocked by proximity check.",
    "requestId": "req_...",
    "details": {
      "score": 25,
      "threshold": 50,
      "reasons": ["joinCodeValid", "gpsMissing", "wifiMissing", "unknownDevice", "noVenueGps"]
    }
  }
}
```

## New env vars

None.

## Tests added

- **`proximity-signals.spec.ts`** — `haversineMeters` (identical points, NYC↔LAX great-circle within 1%, ~111m for 0.001° lat), `isWithinVenueRadius` (at-venue, far-away no-slack, accuracy slack covers gap, negative-accuracy clamp), `wifiHashMatches` (match, mismatch, null/undefined inputs, prefix-vs-full-length rejection), `isLowRiskDevice` (sha256-shaped, 32-char hex, non-hex, empty).
- **`join-trust-scorer.spec.ts`** — weights/threshold pinned by milestone doc, zero-signal case, single-signal cases, valid-QR-alone insufficient (40<50), valid QR+GPS passes (65), valid joinCode+Wi-Fi passes (55), all-signals=130, reason emission for each "missing" path (`qrTokenInvalid`, `gpsMissing`, `noVenueGps`, `gpsOutsideRadius`), `distanceMeters` plumbed through.
- **`proximity.service.spec.ts`** — advisory mode always allows, enforce mode blocks low score, GPS in radius scores, GPS far-away does not, Wi-Fi match scores under enforcement, low-risk device contributes, `noVenueGps` reason when venue isn't configured.
- **`guest.service.spec.ts`** — extended with full M05 cases:
  - Default (advisory) lets a low-score join through.
  - `proximityRequired=true` blocks low score with `FORBIDDEN` + reasons.
  - QR + GPS in radius (65) passes under enforcement.
  - JoinCode + Wi-Fi match (55) passes under enforcement.
  - GPS far away returns `gpsOutsideRadius` in the details.
  - Reasons surface in the success response in advisory mode.
- **Existing M04 specs** updated to include `venueLat/Lng/RadiusMeters/WifiHash` defaults on `PartySessionRecord` and `venue/hasVenueWifi` on `SessionSummary` (so the controller-shape mocks compile against the new types).

Total: **163 unit tests pass.**

## Live E2E verification (recorded against Railway)

Run after the M05 deploy succeeds — see "Manual verification" below.

## Manual verification

1. Apply M05 migration via Supabase MCP (`m05_proximity_gate.sql`) — already applied.
2. Mint a host JWT (or use the one from M02 callback) for a real `users.id` in the DB.
3. Create a session **with proximity enforced + a venue + a Wi-Fi fingerprint**:

   ```bash
   API=https://api-production-7ee5.up.railway.app/api/v1
   curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $HOST_JWT" "$API/sessions" -d '{
     "settings": { "proximityRequired": true },
     "venue":    { "lat": 40.0, "lng": -74.0, "radiusMeters": 200 },
     "venueWifiHash": "'$(printf "venue-wifi-XYZ" | shasum -a 256 | cut -d" " -f1)'"
   }'
   ```

4. Negative case — try to join with only the join code:

   ```bash
   curl -s -X POST -H "Content-Type: application/json" "$API/sessions/$SESSION_ID/join" \
     -d '{ "displayName": "Mallory", "joinCode": "ABC123" }'
   # → 403 FORBIDDEN with details.score=25, details.reasons containing gpsMissing
   ```

5. Positive case — same join code + matching Wi-Fi hash:

   ```bash
   curl -s -X POST -H "Content-Type: application/json" "$API/sessions/$SESSION_ID/join" -d '{
     "displayName": "Alice",
     "joinCode": "ABC123",
     "wifiHash": "'$(printf "venue-wifi-XYZ" | shasum -a 256 | cut -d" " -f1)'"
   }'
   # → 201, proximity.score=55, allowed=true
   ```

## Known issues / limitations

- **No rate-limiting on join attempts yet** — repeated `FORBIDDEN` responses still touch the DB to load the session. Per-IP bucket arrives in M16 (Moderation and Abuse Protection).
- **"Low-risk device" stays minimal** — a sha-shaped fingerprint is enough to count. Reputation/blocklists are in M16.
- **Wi-Fi hash format is opaque to the server** — we never validate that the host's `venueWifiHash` was actually computed from a Wi-Fi fingerprint. Mis-configuration will simply mean no guest's wifi will ever match.
- **GPS accuracy slack is one-sided** — we subtract `accuracyMeters` from the distance to be lenient on jitter. We don't do anything special for guests sending GPS with absurdly large accuracy (the DTO caps at 5 km, and the score cushion can never push someone literally on the other side of the world inside the radius — it'd just be more permissive within the cap).
- **No audit log for proximity blocks** — the rejection is logged via Pino but not persisted. M18 (Observability) introduces the audit log table.
- **`venue_wifi_hash` returned only as a boolean** (`hasVenueWifi`) on `SessionSummary` — by design. If a host UI wants to confirm the hash was set, they can compare `hasVenueWifi: true` after their own POST.

## Next milestone dependencies (Milestone 06 — Track Search and Normalization)

M06 can proceed because:

- Proximity-gated joins are non-breaking — every guest who reaches the search endpoint already passed `joinSession`, so they have a valid guest JWT.
- The existing guest JWT (`aud=fairplay:guest`, `sid=<sessionId>`) is the auth substrate M06 will use to scope search to the joining session.
- The standard error envelope handles `FORBIDDEN`/`UNAUTHORIZED` consistently — M06 search endpoints can reuse the same shape for downstream Spotify failures.
- `SessionSettings.allowExplicitTracks` is already in `DEFAULT_SESSION_SETTINGS`; M06 should consult it when filtering search results.
