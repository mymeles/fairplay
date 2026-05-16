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

