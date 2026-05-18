import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DomainError } from '@fairplay/shared-utils';
import { Fetcher, FETCHER } from '../spotify-playback/spotify-playback.adapter';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export interface SpotifyArtistDto {
  name?: string | null;
}

export interface SpotifyAlbumImageDto {
  url?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface SpotifyAlbumDto {
  name?: string | null;
  images?: SpotifyAlbumImageDto[] | null;
}

export interface SpotifyTrackItemDto {
  id?: string | null;
  uri?: string | null;
  name?: string | null;
  artists?: SpotifyArtistDto[] | null;
  album?: SpotifyAlbumDto | null;
  duration_ms?: number | null;
  explicit?: boolean | null;
  is_local?: boolean | null;
}

interface SpotifySearchResponseDto {
  tracks?: {
    items?: SpotifyTrackItemDto[];
  };
}

@Injectable()
export class SpotifySearchAdapter {
  private readonly logger = new Logger(SpotifySearchAdapter.name);
  private readonly fetcher: Fetcher;

  constructor(@Optional() @Inject(FETCHER) fetcher?: Fetcher) {
    this.fetcher = fetcher ?? fetch;
  }

  async searchTracks(
    accessToken: string,
    query: string,
    limit: number,
  ): Promise<SpotifyTrackItemDto[]> {
    const url = new URL(`${SPOTIFY_API_BASE}/search`);
    url.searchParams.set('type', 'track');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));

    let res: Response;
    try {
      res = await this.fetcher(url.toString(), {
        headers: { authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      this.logger.warn(
        { err, op: 'searchTracks' },
        'Spotify search request failed before response.',
      );
      throw new DomainError(
        'EXTERNAL_DEPENDENCY_FAILED',
        'Spotify search is temporarily unavailable.',
        { op: 'searchTracks' },
      );
    }
    await this.assertOk(res, 'searchTracks');

    let body: SpotifySearchResponseDto;
    try {
      body = (await res.json()) as SpotifySearchResponseDto;
    } catch (err) {
      this.logger.warn({ err }, 'Spotify search response was malformed.');
      throw new DomainError(
        'EXTERNAL_DEPENDENCY_FAILED',
        'Spotify search response was malformed.',
        { op: 'searchTracks' },
      );
    }
    return body.tracks?.items ?? [];
  }

  private async assertOk(res: Response, op: string): Promise<void> {
    if (res.ok) return;
    const status = res.status;
    const retryAfterHeader = res.headers.get('retry-after');
    const body = await safeText(res);

    if (status === 401) {
      throw new DomainError('SPOTIFY_AUTH_FAILED', 'Spotify rejected the access token.', {
        op,
        body,
      });
    }
    if (status === 429) {
      const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : null;
      throw new DomainError('SPOTIFY_RATE_LIMITED', 'Spotify rate limit hit.', {
        op,
        retryAfterSec: Number.isFinite(retryAfter) ? retryAfter : null,
      });
    }

    this.logger.warn({ status, op, body }, 'Spotify search request failed.');
    throw new DomainError(
      'EXTERNAL_DEPENDENCY_FAILED',
      `Spotify search request failed (${status}).`,
      { op, status },
    );
  }
}

const safeText = async (res: Response): Promise<string | null> => {
  try {
    return await res.text();
  } catch {
    return null;
  }
};
