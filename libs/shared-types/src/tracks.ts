export interface TrackDto {
  spotifyUri: string;
  spotifyTrackId: string;
  title: string;
  artist: string;
  album?: string;
  durationMs: number;
  artworkUrl?: string;
  explicit: boolean;
}

export interface FallbackTrackDto {
  id: string;
  sessionId: string;
  trackId: string;
  position: number;
  enabled: boolean;
  lastQueuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  track: TrackDto;
}
