import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DomainError } from '@fairplay/shared-utils';

// Spotify API base. Centralized so tests can swap fetch but real callers go to
// the canonical host.
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export type Fetcher = typeof fetch;
export const FETCHER = Symbol('SpotifyPlaybackAdapter.Fetcher');

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isRestricted: boolean;
  isPrivateSession: boolean;
  volumePercent: number | null;
  supportsVolume: boolean;
}

export interface SpotifyPlaybackState {
  device: SpotifyDevice | null;
  isPlaying: boolean;
  progressMs: number | null;
  shuffleState: boolean;
  repeatState: 'off' | 'track' | 'context';
  trackUri: string | null;
}

interface SpotifyDeviceDto {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
  is_private_session?: boolean;
  volume_percent: number | null;
  supports_volume?: boolean;
}

interface SpotifyDevicesDto {
  devices: SpotifyDeviceDto[];
}

interface SpotifyPlaybackDto {
  device: SpotifyDeviceDto | null;
  is_playing: boolean;
  progress_ms: number | null;
  shuffle_state: boolean;
  repeat_state: 'off' | 'track' | 'context';
  item: { uri: string } | null;
}

const mapDevice = (dto: SpotifyDeviceDto): SpotifyDevice | null => {
  // Spotify can return devices with null IDs (rare; usually short-lived
  // mid-handoff state). Drop them — we can't transfer to a null device.
  if (!dto.id) return null;
  return {
    id: dto.id,
    name: dto.name,
    type: dto.type,
    isActive: dto.is_active,
    isRestricted: dto.is_restricted,
    isPrivateSession: dto.is_private_session ?? false,
    volumePercent: dto.volume_percent,
    supportsVolume: dto.supports_volume ?? dto.volume_percent !== null,
  };
};

@Injectable()
export class SpotifyPlaybackAdapter {
  private readonly logger = new Logger(SpotifyPlaybackAdapter.name);
  private readonly fetcher: Fetcher;

  constructor(@Optional() @Inject(FETCHER) fetcher?: Fetcher) {
    this.fetcher = fetcher ?? fetch;
  }

  async getDevices(accessToken: string): Promise<SpotifyDevice[]> {
    const res = await this.fetcher(`${SPOTIFY_API_BASE}/me/player/devices`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    await this.assertOk(res, 'getDevices');
    const body = (await res.json()) as SpotifyDevicesDto;
    return (body.devices ?? []).map(mapDevice).filter((d): d is SpotifyDevice => d !== null);
  }

  async getPlaybackState(accessToken: string): Promise<SpotifyPlaybackState | null> {
    const res = await this.fetcher(`${SPOTIFY_API_BASE}/me/player`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    // Spotify returns 204 when there is no active playback session.
    if (res.status === 204) return null;
    await this.assertOk(res, 'getPlaybackState');
    const body = (await res.json()) as SpotifyPlaybackDto;
    return {
      device: body.device ? mapDevice(body.device) : null,
      isPlaying: body.is_playing,
      progressMs: body.progress_ms,
      shuffleState: body.shuffle_state,
      repeatState: body.repeat_state,
      trackUri: body.item?.uri ?? null,
    };
  }

  async transferPlayback(accessToken: string, deviceId: string, play: boolean): Promise<void> {
    const res = await this.fetcher(`${SPOTIFY_API_BASE}/me/player`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      // Spotify treats `play` as advisory — true keeps current playback
      // state on the new device, false forces paused.
      body: JSON.stringify({ device_ids: [deviceId], play }),
    });
    // Spotify returns 204 No Content on success. 404 means the device id
    // is no longer active.
    if (res.status === 204) return;
    if (res.status === 404) {
      throw new DomainError('SPOTIFY_DEVICE_NOT_FOUND', 'Spotify device not found.', {
        deviceId,
      });
    }
    await this.assertOk(res, 'transferPlayback');
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
      // Spotify returns 403 most commonly when the host is not a Premium
      // subscriber. Surface a single typed error so the controller layer
      // doesn't have to interpret upstream bodies.
      throw new DomainError(
        'SPOTIFY_PREMIUM_REQUIRED',
        'Spotify Premium is required to control playback.',
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
    this.logger.warn({ status, op, body }, 'Spotify request failed.');
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
