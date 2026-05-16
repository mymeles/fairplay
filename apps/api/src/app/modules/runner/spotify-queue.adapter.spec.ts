import { DomainError } from '@fairplay/shared-utils';
import { SpotifyQueueAdapter } from './spotify-queue.adapter';

const ACCESS_TOKEN = 'token-abc';
const TRACK_URI = 'spotify:track:M12';

const makeRes = (status: number, body: unknown = '', headers: Record<string, string> = {}) => {
  // 204/205/304 cannot carry a body per the Fetch spec.
  const init: ResponseInit = { status, headers };
  if (status === 204 || status === 205 || status === 304) {
    return new Response(null, init);
  }
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), init);
};

describe('SpotifyQueueAdapter.enqueueTrack', () => {
  it('appends to the active device with no deviceId set', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeRes(204));
    const adapter = new SpotifyQueueAdapter(fetcher);
    await adapter.enqueueTrack(ACCESS_TOKEN, TRACK_URI);
    const url = String((fetcher.mock.calls[0] as [string, unknown])[0]);
    expect(url).toContain('/me/player/queue');
    expect(url).toContain(`uri=${encodeURIComponent(TRACK_URI)}`);
    expect(url).not.toContain('device_id');
  });

  it('includes device_id when provided', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeRes(204));
    const adapter = new SpotifyQueueAdapter(fetcher);
    await adapter.enqueueTrack(ACCESS_TOKEN, TRACK_URI, 'dev-1');
    const url = String((fetcher.mock.calls[0] as [string, unknown])[0]);
    expect(url).toContain('device_id=dev-1');
  });

  it('maps 401 to SPOTIFY_AUTH_FAILED', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeRes(401, 'expired'));
    const adapter = new SpotifyQueueAdapter(fetcher);
    await expect(adapter.enqueueTrack(ACCESS_TOKEN, TRACK_URI)).rejects.toMatchObject({
      code: 'SPOTIFY_AUTH_FAILED',
    });
  });

  it('maps 403 to SPOTIFY_PREMIUM_REQUIRED', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeRes(403, 'premium'));
    const adapter = new SpotifyQueueAdapter(fetcher);
    await expect(adapter.enqueueTrack(ACCESS_TOKEN, TRACK_URI)).rejects.toMatchObject({
      code: 'SPOTIFY_PREMIUM_REQUIRED',
    });
  });

  it('maps 404 to SPOTIFY_NO_ACTIVE_DEVICE', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeRes(404, 'no device'));
    const adapter = new SpotifyQueueAdapter(fetcher);
    await expect(adapter.enqueueTrack(ACCESS_TOKEN, TRACK_URI)).rejects.toMatchObject({
      code: 'SPOTIFY_NO_ACTIVE_DEVICE',
    });
  });

  it('maps 429 to SPOTIFY_RATE_LIMITED with retryAfterSec', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(makeRes(429, 'slow down', { 'retry-after': '7' }));
    const adapter = new SpotifyQueueAdapter(fetcher);
    await expect(adapter.enqueueTrack(ACCESS_TOKEN, TRACK_URI)).rejects.toMatchObject({
      code: 'SPOTIFY_RATE_LIMITED',
      details: { retryAfterSec: 7 },
    });
  });

  it('maps other errors to EXTERNAL_DEPENDENCY_FAILED', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeRes(500, 'oops'));
    const adapter = new SpotifyQueueAdapter(fetcher);
    await expect(adapter.enqueueTrack(ACCESS_TOKEN, TRACK_URI)).rejects.toBeInstanceOf(DomainError);
  });
});

describe('SpotifyQueueAdapter.getQueue', () => {
  it('parses currently_playing and queue items, dropping malformed entries', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      makeRes(200, {
        currently_playing: { uri: 'spotify:track:now', name: 'Now', duration_ms: 1000 },
        queue: [
          { uri: 'spotify:track:next', name: 'Next', duration_ms: 2000 },
          { uri: null, name: 'broken', duration_ms: 3000 },
          { uri: 'spotify:track:later', name: 'Later', duration_ms: 4000 },
        ],
      }),
    );
    const adapter = new SpotifyQueueAdapter(fetcher);
    const snap = await adapter.getQueue(ACCESS_TOKEN);
    expect(snap?.currentlyPlaying?.uri).toBe('spotify:track:now');
    expect(snap?.queue.map((q) => q.uri)).toEqual([
      'spotify:track:next',
      'spotify:track:later',
    ]);
  });

  it('returns null on 204 (no active playback)', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeRes(204));
    const adapter = new SpotifyQueueAdapter(fetcher);
    await expect(adapter.getQueue(ACCESS_TOKEN)).resolves.toBeNull();
  });
});
