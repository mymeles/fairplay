import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DomainError } from '@fairplay/shared-utils';
import { FETCHER, type Fetcher } from '../spotify-playback/spotify-playback.adapter';

// Centralized Spotify Web API base — kept private so tests cannot accidentally
// hit Spotify's real servers; pass FETCHER to swap.
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export interface SpotifyQueueItem {
  uri: string;
  name: string;
  durationMs: number;
}

export interface SpotifyQueueSnapshot {
  currentlyPlaying: SpotifyQueueItem | null;
  queue: SpotifyQueueItem[];
}

interface SpotifyTrackDto {
  uri?: string;
  name?: string;
  duration_ms?: number;
}

interface SpotifyQueueDto {
  currently_playing: SpotifyTrackDto | null;
  queue: SpotifyTrackDto[];
}

const mapItem = (dto: SpotifyTrackDto | null | undefined): SpotifyQueueItem | null => {
  if (!dto?.uri || typeof dto.name !== 'string' || typeof dto.duration_ms !== 'number') {
    return null;
  }
  return { uri: dto.uri, name: dto.name, durationMs: dto.duration_ms };
};

@Injectable()
export class SpotifyQueueAdapter {
  private readonly logger = new Logger(SpotifyQueueAdapter.name);
  private readonly fetcher: Fetcher;

  constructor(@Optional() @Inject(FETCHER) fetcher?: Fetcher) {
    this.fetcher = fetcher ?? fetch;
  }

  // GET /v1/me/player/queue — returns currently playing + the next N. The
  // runner uses this only when it needs a Spotify-side view of buffer depth;
  // for the M12 happy path we count QUEUED_TO_SPOTIFY rows in our own DB
  // (cheaper and deterministic). Exposed here for M13 now-playing sync.
  async getQueue(accessToken: string): Promise<SpotifyQueueSnapshot | null> {
    const res = await this.fetcher(`${SPOTIFY_API_BASE}/me/player/queue`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    // 204 means "no active playback session" — same convention as
    // /v1/me/player. The caller should treat it as "device not ready".
    if (res.status === 204) return null;
    await this.assertOk(res, 'getQueue');
    const body = (await res.json()) as SpotifyQueueDto;
    return {
      currentlyPlaying: mapItem(body.currently_playing),
      queue: (body.queue ?? []).map(mapItem).filter((q): q is SpotifyQueueItem => q !== null),
    };
  }

  // POST /v1/me/player/queue?uri=spotify:track:...&device_id=... — appends to
  // the host's Spotify queue. Spotify returns 204 No Content on success.
  // The `deviceId` is optional; if omitted Spotify uses the active device.
  async enqueueTrack(
    accessToken: string,
    trackUri: string,
    deviceId: string | null = null,
  ): Promise<void> {
    const url = new URL(`${SPOTIFY_API_BASE}/me/player/queue`);
    url.searchParams.set('uri', trackUri);
    if (deviceId) url.searchParams.set('device_id', deviceId);

    const res = await this.fetcher(url.toString(), {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 204) return;
    await this.assertOk(res, 'enqueueTrack');
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
    if (status === 403) {
      throw new DomainError(
        'SPOTIFY_PREMIUM_REQUIRED',
        'Spotify Premium is required to queue tracks.',
        { op, body },
      );
    }
    if (status === 404) {
      // Spotify uses 404 for both "no active device" and "endpoint not
      // found"; the latter shouldn't happen for documented endpoints. Treat
      // as no active device — the dispatcher will disable the runner and
      // ask the host to (re-)select a device.
      throw new DomainError(
        'SPOTIFY_NO_ACTIVE_DEVICE',
        'Spotify has no active playback device.',
        { op, body },
      );
    }
    if (status === 429) {
      const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : null;
      throw new DomainError('SPOTIFY_RATE_LIMITED', 'Spotify rate limit hit.', {
        op,
        retryAfterSec: Number.isFinite(retryAfter) ? retryAfter : null,
      });
    }
    this.logger.warn({ status, op, body }, 'Spotify queue request failed.');
    throw new DomainError(
      'EXTERNAL_DEPENDENCY_FAILED',
      `Spotify request failed (${status}).`,
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
