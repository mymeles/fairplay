import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '@fairplay/shared-utils';
import { RedisService } from '../redis/redis.service';
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

const DEVICE_CACHE_TTL_SECONDS = 90;
const EMPTY_DEVICE_CACHE_TTL_SECONDS = 30;
const MAX_DEVICE_BACKOFF_SECONDS = 24 * 60 * 60;

@Injectable()
export class SpotifyDeviceService {
  private readonly logger = new Logger(SpotifyDeviceService.name);

  constructor(
    private readonly tokenRefresh: SpotifyTokenRefreshService,
    private readonly adapter: SpotifyPlaybackAdapter,
    private readonly users: UserRepository,
    private readonly redis: RedisService,
  ) {}

  async listDevices(userId: string): Promise<ListDevicesResult> {
    const cached = await this.readDevicesCache(userId);
    if (cached) {
      const user = await this.users.findById(userId);
      return { devices: cached, selectedDeviceId: user?.selectedDeviceId ?? null };
    }

    await this.throwIfDeviceBackoffActive(userId);

    let devices: SpotifyDevice[];
    try {
      devices = await this.callWithAuthRetry(userId, (token) =>
        this.adapter.getDevices(token),
      );
    } catch (err) {
      if (err instanceof DomainError && err.code === 'SPOTIFY_RATE_LIMITED') {
        const retryAfterSec = normalizeRetryAfter(err.details.retryAfterSec);
        await this.storeDeviceBackoff(userId, retryAfterSec);
        this.logger.warn({ userId, retryAfterSec }, 'Spotify devices rate limit encountered.');
      }
      throw err;
    }

    await this.writeDevicesCache(userId, devices);
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
    const devices = await this.getDevicesForSelection(userId);
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

  async skip(userId: string): Promise<{ ok: true }> {
    const deviceId = await this.deviceIdFor(userId);
    await this.callWithAuthRetry(userId, (token) =>
      this.adapter.skipToNext(token, deviceId),
    );
    this.logger.log({ userId, deviceId }, 'Host invoked Spotify skip.');
    return { ok: true };
  }

  async pause(userId: string): Promise<{ ok: true }> {
    const deviceId = await this.deviceIdFor(userId);
    await this.callWithAuthRetry(userId, (token) => this.adapter.pause(token, deviceId));
    this.logger.log({ userId, deviceId }, 'Host invoked Spotify pause.');
    return { ok: true };
  }

  async resume(userId: string): Promise<{ ok: true }> {
    const deviceId = await this.deviceIdFor(userId);
    await this.callWithAuthRetry(userId, (token) => this.adapter.resume(token, deviceId));
    this.logger.log({ userId, deviceId }, 'Host invoked Spotify resume.');
    return { ok: true };
  }

  // Resolve the host's preferred device. Falls back to whatever Spotify
  // considers active when we haven't recorded a selection yet.
  private async deviceIdFor(userId: string): Promise<string | null> {
    const user = await this.users.findById(userId);
    return user?.selectedDeviceId ?? null;
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

  private async getDevicesForSelection(userId: string): Promise<SpotifyDevice[]> {
    const cached = await this.readDevicesCache(userId);
    if (cached) return cached;
    const result = await this.listDevices(userId);
    return result.devices;
  }

  private async readDevicesCache(userId: string): Promise<SpotifyDevice[] | null> {
    const key = deviceCacheKey(userId);
    try {
      const raw = await this.redis.getClient().get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || !parsed.every(isSpotifyDevice)) {
        this.logger.warn({ userId }, 'Ignoring malformed Spotify devices cache entry.');
        return null;
      }
      return parsed;
    } catch (err) {
      this.logger.warn({ err, userId }, 'Spotify devices cache read failed.');
      return null;
    }
  }

  private async writeDevicesCache(userId: string, devices: SpotifyDevice[]): Promise<void> {
    try {
      await this.redis
        .getClient()
        .set(
          deviceCacheKey(userId),
          JSON.stringify(devices),
          'EX',
          devices.length ? DEVICE_CACHE_TTL_SECONDS : EMPTY_DEVICE_CACHE_TTL_SECONDS,
        );
    } catch (err) {
      this.logger.warn({ err, userId }, 'Spotify devices cache write failed.');
    }
  }

  private async throwIfDeviceBackoffActive(userId: string): Promise<void> {
    const key = deviceBackoffKey(userId);
    try {
      const active = await this.redis.getClient().get(key);
      if (!active) return;
      const ttl = await this.redis.getClient().ttl(key);
      throw new DomainError(
        'SPOTIFY_RATE_LIMITED',
        'Spotify device lookup is temporarily rate limited.',
        { retryAfterSec: ttl > 0 ? ttl : null },
      );
    } catch (err) {
      if (err instanceof DomainError) throw err;
      this.logger.warn({ err, userId }, 'Spotify devices backoff check failed.');
    }
  }

  private async storeDeviceBackoff(userId: string, retryAfterSec: number): Promise<void> {
    try {
      await this.redis.getClient().set(deviceBackoffKey(userId), '1', 'EX', retryAfterSec);
    } catch (err) {
      this.logger.warn({ err, userId, retryAfterSec }, 'Spotify devices backoff write failed.');
    }
  }
}

const deviceCacheKey = (userId: string): string => `spotify:devices:cache:${userId}`;
const deviceBackoffKey = (userId: string): string => `spotify:devices:backoff:${userId}`;

const normalizeRetryAfter = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 60;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_DEVICE_BACKOFF_SECONDS);
};

const isSpotifyDevice = (value: unknown): value is SpotifyDevice => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof SpotifyDevice, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.isActive === 'boolean' &&
    typeof candidate.isRestricted === 'boolean' &&
    typeof candidate.isPrivateSession === 'boolean' &&
    (candidate.volumePercent === null || typeof candidate.volumePercent === 'number') &&
    typeof candidate.supportsVolume === 'boolean'
  );
};
