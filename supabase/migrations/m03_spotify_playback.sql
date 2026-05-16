-- Milestone 3: Spotify Device Control
--
-- Adds storage for the AES-256-GCM-encrypted access token (so we don't need to
-- refresh on every Spotify call) and the host's currently selected playback
-- device. Selected device lives on users for now; it will move onto
-- party_sessions in Milestone 4 once sessions exist.

alter table public.spotify_tokens
  add column if not exists encrypted_access_token text;

alter table public.users
  add column if not exists selected_device_id text;
