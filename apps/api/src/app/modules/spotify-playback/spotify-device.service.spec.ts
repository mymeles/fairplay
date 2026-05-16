import { DomainError } from '@fairplay/shared-utils';
import type { UserRepository } from '../spotify-auth/user.repository';
import { SpotifyDevice, SpotifyPlaybackAdapter } from './spotify-playback.adapter';
import { SpotifyDeviceService } from './spotify-device.service';
import type { SpotifyTokenRefreshService } from './spotify-token-refresh.service';
import type { RedisService } from '../redis/redis.service';

const device = (id: string, isActive = false): SpotifyDevice => ({
  id,
  name: `device ${id}`,
  type: 'Speaker',
  isActive,
  isRestricted: false,
  isPrivateSession: false,
  volumePercent: 50,
  supportsVolume: true,
});

const makeRefresh = (
  token: string = 'AT',
): jest.Mocked<SpotifyTokenRefreshService> =>
  ({
    getValidAccessToken: jest.fn().mockResolvedValue(token),
    forceRefresh: jest.fn().mockResolvedValue(`${token}-FRESH`),
  }) as unknown as jest.Mocked<SpotifyTokenRefreshService>;

const makeAdapter = (): jest.Mocked<SpotifyPlaybackAdapter> =>
  ({
    getDevices: jest.fn(),
    getPlaybackState: jest.fn(),
    transferPlayback: jest.fn(),
  }) as unknown as jest.Mocked<SpotifyPlaybackAdapter>;

const makeUsers = (
  selectedDeviceId: string | null = null,
): jest.Mocked<UserRepository> =>
  ({
    findById: jest.fn().mockResolvedValue({
      id: 'user-1',
      email: null,
      displayName: null,
      spotifyUserId: 'sp-1',
      selectedDeviceId,
    }),
    setSelectedDeviceId: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<UserRepository>;

const makeRedis = () => {
  const client = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    ttl: jest.fn().mockResolvedValue(-1),
  };
  const redis = {
    getClient: jest.fn(() => client),
  } as unknown as jest.Mocked<RedisService>;
  return { redis, client };
};

describe('SpotifyDeviceService.listDevices', () => {
  it('returns devices and the persisted selectedDeviceId', async () => {
    const refresh = makeRefresh();
    const adapter = makeAdapter();
    adapter.getDevices.mockResolvedValue([device('d1'), device('d2', true)]);
    const users = makeUsers('d2');
    const { redis, client } = makeRedis();
    const svc = new SpotifyDeviceService(refresh, adapter, users, redis);

    const result = await svc.listDevices('user-1');
    expect(result.devices).toHaveLength(2);
    expect(result.selectedDeviceId).toBe('d2');
    expect(refresh.getValidAccessToken).toHaveBeenCalledWith('user-1');
    expect(adapter.getDevices).toHaveBeenCalledWith('AT');
    expect(client.set).toHaveBeenCalledWith(
      'spotify:devices:cache:user-1',
      expect.any(String),
      'EX',
      90,
    );
  });

  it('returns an empty device list when Spotify reports none', async () => {
    const refresh = makeRefresh();
    const adapter = makeAdapter();
    adapter.getDevices.mockResolvedValue([]);
    const { redis, client } = makeRedis();
    const svc = new SpotifyDeviceService(refresh, adapter, makeUsers(null), redis);
    const result = await svc.listDevices('user-1');
    expect(result.devices).toEqual([]);
    expect(result.selectedDeviceId).toBeNull();
    expect(client.set).toHaveBeenCalledWith(
      'spotify:devices:cache:user-1',
      '[]',
      'EX',
      30,
    );
  });

  it('returns cached devices without calling Spotify', async () => {
    const refresh = makeRefresh();
    const adapter = makeAdapter();
    const users = makeUsers('d1');
    const { redis, client } = makeRedis();
    client.get.mockResolvedValueOnce(JSON.stringify([device('d1')]));
    const svc = new SpotifyDeviceService(refresh, adapter, users, redis);

    const result = await svc.listDevices('user-1');
    expect(result.devices).toEqual([device('d1')]);
    expect(result.selectedDeviceId).toBe('d1');
    expect(refresh.getValidAccessToken).not.toHaveBeenCalled();
    expect(adapter.getDevices).not.toHaveBeenCalled();
  });

  it('forces a refresh and retries once on SPOTIFY_AUTH_FAILED', async () => {
    const refresh = makeRefresh();
    const adapter = makeAdapter();
    adapter.getDevices
      .mockRejectedValueOnce(new DomainError('SPOTIFY_AUTH_FAILED', '401'))
      .mockResolvedValueOnce([device('d1')]);
    const { redis } = makeRedis();
    const svc = new SpotifyDeviceService(refresh, adapter, makeUsers(), redis);

    const result = await svc.listDevices('user-1');
    expect(result.devices).toHaveLength(1);
    expect(refresh.forceRefresh).toHaveBeenCalledWith('user-1');
    expect(adapter.getDevices).toHaveBeenNthCalledWith(2, 'AT-FRESH');
  });

  it('propagates SPOTIFY_PREMIUM_REQUIRED without retry', async () => {
    const refresh = makeRefresh();
    const adapter = makeAdapter();
    adapter.getDevices.mockRejectedValue(
      new DomainError('SPOTIFY_PREMIUM_REQUIRED', 'no premium'),
    );
    const { redis } = makeRedis();
    const svc = new SpotifyDeviceService(refresh, adapter, makeUsers(), redis);
    await expect(svc.listDevices('user-1')).rejects.toMatchObject({
      code: 'SPOTIFY_PREMIUM_REQUIRED',
    });
    expect(refresh.forceRefresh).not.toHaveBeenCalled();
  });

  it('stores backoff when Spotify rate-limits device lookup', async () => {
    const refresh = makeRefresh();
    const adapter = makeAdapter();
    adapter.getDevices.mockRejectedValue(
      new DomainError('SPOTIFY_RATE_LIMITED', 'limited', { retryAfterSec: 120 }),
    );
    const { redis, client } = makeRedis();
    const svc = new SpotifyDeviceService(refresh, adapter, makeUsers(), redis);

    await expect(svc.listDevices('user-1')).rejects.toMatchObject({
      code: 'SPOTIFY_RATE_LIMITED',
    });
    expect(client.set).toHaveBeenCalledWith(
      'spotify:devices:backoff:user-1',
      '1',
      'EX',
      120,
    );
  });

  it('short-circuits while device backoff is active', async () => {
    const refresh = makeRefresh();
    const adapter = makeAdapter();
    const { redis, client } = makeRedis();
    client.get.mockResolvedValueOnce(null).mockResolvedValueOnce('1');
    client.ttl.mockResolvedValueOnce(42);
    const svc = new SpotifyDeviceService(refresh, adapter, makeUsers(), redis);

    await expect(svc.listDevices('user-1')).rejects.toMatchObject({
      code: 'SPOTIFY_RATE_LIMITED',
      details: { retryAfterSec: 42 },
    });
    expect(adapter.getDevices).not.toHaveBeenCalled();
  });
});

describe('SpotifyDeviceService.getPlaybackState', () => {
  it('returns active=false when there is no active playback', async () => {
    const refresh = makeRefresh();
    const adapter = makeAdapter();
    adapter.getPlaybackState.mockResolvedValue(null);
    const { redis } = makeRedis();
    const svc = new SpotifyDeviceService(refresh, adapter, makeUsers(), redis);
    await expect(svc.getPlaybackState('user-1')).resolves.toEqual({ active: false, state: null });
  });

  it('returns the playback state when present', async () => {
    const refresh = makeRefresh();
    const adapter = makeAdapter();
    adapter.getPlaybackState.mockResolvedValue({
      device: device('d1', true),
      isPlaying: true,
      progressMs: 1000,
      shuffleState: false,
      repeatState: 'off',
      trackUri: 'spotify:track:abc',
    });
    const { redis } = makeRedis();
    const svc = new SpotifyDeviceService(refresh, adapter, makeUsers(), redis);
    const result = await svc.getPlaybackState('user-1');
    expect(result.active).toBe(true);
    expect(result.state?.isPlaying).toBe(true);
    expect(result.state?.trackUri).toBe('spotify:track:abc');
  });
});

describe('SpotifyDeviceService.selectDevice', () => {
  it('transfers playback and persists the selection', async () => {
    const refresh = makeRefresh();
    const adapter = makeAdapter();
    adapter.getDevices.mockResolvedValue([device('d1'), device('d2')]);
    adapter.transferPlayback.mockResolvedValue(undefined);
    const users = makeUsers();
    const { redis } = makeRedis();
    const svc = new SpotifyDeviceService(refresh, adapter, users, redis);

    const result = await svc.selectDevice('user-1', 'd2');
    expect(result).toEqual({ deviceId: 'd2', transferred: true });
    expect(adapter.transferPlayback).toHaveBeenCalledWith('AT', 'd2', true);
    expect(users.setSelectedDeviceId).toHaveBeenCalledWith('user-1', 'd2');
  });

  it('throws SPOTIFY_DEVICE_NOT_FOUND when the requested device is not in the list', async () => {
    const refresh = makeRefresh();
    const adapter = makeAdapter();
    adapter.getDevices.mockResolvedValue([device('d1')]);
    const { redis } = makeRedis();
    const svc = new SpotifyDeviceService(refresh, adapter, makeUsers(), redis);
    await expect(svc.selectDevice('user-1', 'unknown')).rejects.toMatchObject({
      code: 'SPOTIFY_DEVICE_NOT_FOUND',
    });
    expect(adapter.transferPlayback).not.toHaveBeenCalled();
  });
});
