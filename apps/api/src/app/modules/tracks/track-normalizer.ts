import { Injectable } from '@nestjs/common';
import type { TrackDto } from '@fairplay/shared-types';
import type { SpotifyTrackItemDto } from './spotify-search.adapter';

const SPOTIFY_TRACK_URI_RE = /^spotify:track:[A-Za-z0-9]+$/;

@Injectable()
export class TrackNormalizer {
  normalize(track: SpotifyTrackItemDto): TrackDto | null {
    if (track.is_local === true) return null;

    const spotifyTrackId = clean(track.id);
    const spotifyUri = clean(track.uri);
    const title = clean(track.name);
    const artistNames =
      track.artists
        ?.map((artist) => clean(artist.name))
        .filter((name): name is string => name !== undefined) ?? [];
    const durationMs =
      typeof track.duration_ms === 'number' && Number.isFinite(track.duration_ms)
        ? Math.trunc(track.duration_ms)
        : null;

    if (
      !spotifyTrackId ||
      !spotifyUri ||
      !SPOTIFY_TRACK_URI_RE.test(spotifyUri) ||
      !title ||
      artistNames.length === 0 ||
      durationMs === null ||
      durationMs <= 0
    ) {
      return null;
    }

    const album = clean(track.album?.name);
    const artworkUrl = track.album?.images
      ?.map((image) => clean(image.url))
      .find((url): url is string => url !== undefined);

    return {
      spotifyUri,
      spotifyTrackId,
      title,
      artist: artistNames.join(', '),
      ...(album ? { album } : {}),
      durationMs,
      ...(artworkUrl ? { artworkUrl } : {}),
      explicit: track.explicit === true,
    };
  }

  normalizeMany(tracks: SpotifyTrackItemDto[]): TrackDto[] {
    return tracks
      .map((track) => this.normalize(track))
      .filter((track): track is TrackDto => track !== null);
  }
}

const clean = (value: string | null | undefined): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

