import { SpotifyPlaybackAdapter } from './spotify-playback.adapter';

const TOKEN = 'token-abc';

const makeRes = (status: number, body = '', headers: Record<string, string> = {}) => {
  const init: ResponseInit = { status, headers };
  if (status === 204 || status === 205 || status === 304) {
    return new Response(null, init);
  }
  return new Response(body, init);
};

// Lightweight coverage for M14's three new adapter methods. The shared
// assertOk path is exercised by spotify-playback.adapter.spec.ts already, so
// here we focus on: (a) the right verb + path + device_id query, (b) 204
// success, (c) 404 → SPOTIFY_NO_ACTIVE_DEVICE (the new branch on these
// endpoints).
describe('SpotifyPlaybackAdapter host controls', () => {
  it('skipToNext POSTs /me/player/next with the device_id', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeRes(204));
    const adapter = new SpotifyPlaybackAdapter(fetcher);
    await adapter.skipToNext(TOKEN, 'dev-1');
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/me/player/next');
    expect(url).toContain('device_id=dev-1');
    expect(init.method).toBe('POST');
  });

  it('pause PUTs /me/player/pause without a deviceId when none is set', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeRes(204));
    const adapter = new SpotifyPlaybackAdapter(fetcher);
    await adapter.pause(TOKEN);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/me/player/pause');
    expect(url).not.toContain('device_id');
    expect(init.method).toBe('PUT');
  });

  it('resume PUTs /me/player/play with the device_id', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeRes(204));
    const adapter = new SpotifyPlaybackAdapter(fetcher);
    await adapter.resume(TOKEN, 'dev-2');
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/me/player/play');
    expect(url).toContain('device_id=dev-2');
    expect(init.method).toBe('PUT');
  });

  it('maps 404 on skip to SPOTIFY_NO_ACTIVE_DEVICE', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeRes(404, 'no device'));
    const adapter = new SpotifyPlaybackAdapter(fetcher);
    await expect(adapter.skipToNext(TOKEN)).rejects.toMatchObject({
      code: 'SPOTIFY_NO_ACTIVE_DEVICE',
    });
  });

  it('maps 401 on resume to SPOTIFY_AUTH_FAILED', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeRes(401, 'expired'));
    const adapter = new SpotifyPlaybackAdapter(fetcher);
    await expect(adapter.resume(TOKEN)).rejects.toMatchObject({
      code: 'SPOTIFY_AUTH_FAILED',
    });
  });

  it('maps 429 with Retry-After on pause', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(makeRes(429, 'slow', { 'retry-after': '4' }));
    const adapter = new SpotifyPlaybackAdapter(fetcher);
    await expect(adapter.pause(TOKEN)).rejects.toMatchObject({
      code: 'SPOTIFY_RATE_LIMITED',
      details: { retryAfterSec: 4 },
    });
  });
});
