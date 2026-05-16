import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '@fairplay/shared-utils';
import { UserRepository } from '../spotify-auth/user.repository';
import {
  SpotifyDevice,
  SpotifyPlaybackAdapter,
  SpotifyPlaybackState,
} from './spotify-playback.adapter';
import { SpotifyTokenRefreshService } from './spotify-token-refresh.service';

export interface ListDevicesResult {
  devices: SpotifyDevice[];
  selectedDeviceId: string | null;
}

export interface PlaybackStateResult {
  active: boolean;
  state: SpotifyPlaybackState | null;
}

export interface SelectDeviceResult {
  deviceId: string;
  transferred: boolean;
}

@Injectable()
export class SpotifyDeviceService {
  private readonly logger = new Logger(SpotifyDeviceService.name);

  constructor(
    private readonly tokenRefresh: SpotifyTokenRefreshService,
    private readonly adapter: SpotifyPlaybackAdapter,
    private readonly users: UserRepository,
  ) {}

  async listDevices(userId: string): Promise<ListDevicesResult> {
    const devices = await this.callWithAuthRetry(userId, (token) =>
      this.adapter.getDevices(token),
    );
    const user = await this.users.findById(userId);
    return { devices, selectedDeviceId: user?.selectedDeviceId ?? null };
  }

  async getPlaybackState(userId: string): Promise<PlaybackStateResult> {
    const state = await this.callWithAuthRetry(userId, (token) =>
      this.adapter.getPlaybackState(token),
    );
    return { active: state !== null, state };
  }

  async selectDevice(userId: string, deviceId: string): Promise<SelectDeviceResult> {
    const devices = await this.callWithAuthRetry(userId, (token) =>
      this.adapter.getDevices(token),
    );
    if (!devices.some((d) => d.id === deviceId)) {
      throw new DomainError(
        'SPOTIFY_DEVICE_NOT_FOUND',
        'Spotify did not return that device for this host.',
        { deviceId, knownDeviceIds: devices.map((d) => d.id) },
      );
    }
    await this.callWithAuthRetry(userId, (token) =>
      this.adapter.transferPlayback(token, deviceId, true),
    );
    await this.users.setSelectedDeviceId(userId, deviceId);
    this.logger.log({ userId, deviceId }, 'Host selected Spotify device.');
    return { deviceId, transferred: true };
  }

  // Single-shot retry on SPOTIFY_AUTH_FAILED. Spotify can revoke an access
  // token mid-window (admin reset, password change, scope change). One forced
  // refresh covers that edge case without masking real auth failures.
  private async callWithAuthRetry<T>(
    userId: string,
    fn: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const token = await this.tokenRefresh.getValidAccessToken(userId);
    try {
      return await fn(token);
    } catch (err) {
      if (err instanceof DomainError && err.code === 'SPOTIFY_AUTH_FAILED') {
        const refreshed = await this.tokenRefresh.forceRefresh(userId);
        return fn(refreshed);
      }
      throw err;
    }
  }
}
