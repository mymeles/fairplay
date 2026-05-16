import { DomainError } from '@fairplay/shared-utils';
import { Fetcher, SpotifyPlaybackAdapter } from './spotify-playback.adapter';

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const emptyResponse = (status: number, headers: Record<string, string> = {}): Response =>
  new Response(null, { status, headers });

describe('SpotifyPlaybackAdapter.getDevices', () => {
  it('maps Spotify devices into the internal shape', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        devices: [
          {
            id: 'd1',
            name: 'Living Room Speaker',
            type: 'Speaker',
            is_active: true,
            is_restricted: false,
            is_private_session: false,
            volume_percent: 80,
            supports_volume: true,
          },
          {
            id: 'd2',
            name: 'Phone',
            type: 'Smartphone',
            is_active: false,
            is_restricted: false,
            volume_percent: null,
          },
        ],
      }),
    ) as jest.MockedFunction<Fetcher>;

    const adapter = new SpotifyPlaybackAdapter(fetcher);
    const devices = await adapter.getDevices('access');

    expect(devices).toEqual([
      {
        id: 'd1',
        name: 'Living Room Speaker',
        type: 'Speaker',
        isActive: true,
        isRestricted: false,
        isPrivateSession: false,
        volumePercent: 80,
        supportsVolume: true,
      },
      {
        id: 'd2',
        name: 'Phone',
        type: 'Smartphone',
        isActive: false,
        isRestricted: false,
        isPrivateSession: false,
        volumePercent: null,
        supportsVolume: false,
      },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/player/devices',
      expect.objectContaining({ headers: { authorization: 'Bearer access' } }),
    );
  });

  it('returns an empty list when no devices are available', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { devices: [] })) as jest.MockedFunction<Fetcher>;
    const adapter = new SpotifyPlaybackAdapter(fetcher);
    await expect(adapter.getDevices('access')).resolves.toEqual([]);
  });

  it('drops devices with a null id', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        devices: [
          { id: null, name: 'Limbo', type: 'Speaker', is_active: false, is_restricted: false, volume_percent: null },
          { id: 'd1', name: 'OK', type: 'Speaker', is_active: false, is_restricted: false, volume_percent: 50 },
        ],
      }),
    ) as jest.MockedFunction<Fetcher>;
    const adapter = new SpotifyPlaybackAdapter(fetcher);
    const devices = await adapter.getDevices('access');
    expect(devices.map((d) => d.id)).toEqual(['d1']);
  });

  it('throws SPOTIFY_AUTH_FAILED on 401', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: 'expired' })) as jest.MockedFunction<Fetcher>;
    const adapter = new SpotifyPlaybackAdapter(fetcher);
    await expect(adapter.getDevices('access')).rejects.toMatchObject({
      code: 'SPOTIFY_AUTH_FAILED',
      httpStatus: 401,
    });
  });

  it('throws SPOTIFY_PREMIUM_REQUIRED on 403', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(jsonResponse(403, { error: 'PREMIUM_REQUIRED' })) as jest.MockedFunction<Fetcher>;
    const adapter = new SpotifyPlaybackAdapter(fetcher);
    await expect(adapter.getDevices('access')).rejects.toMatchObject({
      code: 'SPOTIFY_PREMIUM_REQUIRED',
      httpStatus: 403,
    });
  });

  it('throws SPOTIFY_RATE_LIMITED with retry-after on 429', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(429, { error: 'rate_limit' }, { 'retry-after': '7' }),
      ) as jest.MockedFunction<Fetcher>;
    const adapter = new SpotifyPlaybackAdapter(fetcher);
    try {
      await adapter.getDevices('access');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('SPOTIFY_RATE_LIMITED');
      expect((err as DomainError).details.retryAfterSec).toBe(7);
    }
  });
});

describe('SpotifyPlaybackAdapter.getPlaybackState', () => {
  it('returns null on 204 (no active playback)', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(emptyResponse(204)) as jest.MockedFunction<Fetcher>;
    const adapter = new SpotifyPlaybackAdapter(fetcher);
    await expect(adapter.getPlaybackState('access')).resolves.toBeNull();
  });

  it('maps the active playback state', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        device: {
          id: 'd1',
          name: 'Speaker',
          type: 'Speaker',
          is_active: true,
          is_restricted: false,
          volume_percent: 60,
        },
        is_playing: true,
        progress_ms: 12345,
        shuffle_state: false,
        repeat_state: 'off',
        item: { uri: 'spotify:track:abc' },
      }),
    ) as jest.MockedFunction<Fetcher>;

    const adapter = new SpotifyPlaybackAdapter(fetcher);
    const state = await adapter.getPlaybackState('access');
    expect(state).toEqual({
      device: expect.objectContaining({ id: 'd1', isActive: true }),
      isPlaying: true,
      progressMs: 12345,
      shuffleState: false,
      repeatState: 'off',
      trackUri: 'spotify:track:abc',
    });
  });
});

describe('SpotifyPlaybackAdapter.transferPlayback', () => {
  it('PUTs to /me/player with the correct device_ids', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(emptyResponse(204)) as jest.MockedFunction<Fetcher>;
    const adapter = new SpotifyPlaybackAdapter(fetcher);
    await adapter.transferPlayback('access', 'device-7', true);

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/player',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ device_ids: ['device-7'], play: true }),
      }),
    );
  });

  it('throws SPOTIFY_DEVICE_NOT_FOUND on 404', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(emptyResponse(404)) as jest.MockedFunction<Fetcher>;
    const adapter = new SpotifyPlaybackAdapter(fetcher);
    await expect(adapter.transferPlayback('access', 'device-x', true)).rejects.toMatchObject({
      code: 'SPOTIFY_DEVICE_NOT_FOUND',
    });
  });
});
