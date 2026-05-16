// Scopes pinned by 02_architecture/SPOTIFY_INTEGRATION_RULES.md. Do not add
// scopes here without updating the milestone doc and re-prompting the host.

export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-modify-playback-state',
] as const;

export type SpotifyScope = (typeof SPOTIFY_SCOPES)[number];
