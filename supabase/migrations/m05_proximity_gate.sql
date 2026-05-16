-- Milestone 5: proximity gate.
--
-- Adds an opaque venue Wi-Fi hash on party_sessions so the host can register
-- a venue Wi-Fi fingerprint at session creation. Guests submit their own
-- hash at join time; the server compares the two with a constant-time check.
-- The server never sees the underlying SSID/BSSID or password.

alter table public.party_sessions
  add column if not exists venue_wifi_hash text;
