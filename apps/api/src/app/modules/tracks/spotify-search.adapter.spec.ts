import { DomainError } from '@fairplay/shared-utils';
import { Fetcher } from '../spotify-playback/spotify-playback.adapter';
import { SpotifySearchAdapter } from './spotify-search.adapter';

const jsonResponse = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('SpotifySearchAdapter.searchTracks', () => {
  it('calls Spotify search with type=track and maps items through unchanged', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        tracks: {
          items: [
            {
              id: 'abc',
              uri: 'spotify:track:abc',
              name: 'Song',
              artists: [{ name: 'Artist' }],
              duration_ms: 1000,
              explicit: false,
            },
          ],
        },
      }),
    ) as jest.MockedFunction<Fetcher>;
    const adapter = new SpotifySearchAdapter(fetcher);

    const result = await adapter.searchTracks('access-token', 'dua lipa', 10);

    expect(result).toHaveLength(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain('https://api.spotify.com/v1/search?');
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get('type')).toBe('track');
    expect(parsed.searchParams.get('q')).toBe('dua lipa');
    expect(parsed.searchParams.get('limit')).toBe('10');
    expect(init).toEqual(
      expect.objectContaining({
        headers: { authorization: 'Bearer access-token' },
      }),
    );
  });

  it('returns an empty list when Spotify omits track items', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, {})) as jest.MockedFunction<Fetcher>;
    const adapter = new SpotifySearchAdapter(fetcher);
    await expect(adapter.searchTracks('access-token', 'anything', 10)).resolves.toEqual([]);
  });

  it('throws SPOTIFY_AUTH_FAILED on 401', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: 'expired' })) as jest.MockedFunction<Fetcher>;
    const adapter = new SpotifySearchAdapter(fetcher);
    await expect(adapter.searchTracks('access-token', 'anything', 10)).rejects.toMatchObject({
      code: 'SPOTIFY_AUTH_FAILED',
      httpStatus: 401,
    });
  });

  it('throws SPOTIFY_RATE_LIMITED with retry-after on 429', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(429, { error: 'rate_limit' }, { 'retry-after': '8' }),
      ) as jest.MockedFunction<Fetcher>;
    const adapter = new SpotifySearchAdapter(fetcher);

    try {
      await adapter.searchTracks('access-token', 'anything', 10);
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('SPOTIFY_RATE_LIMITED');
      expect((err as DomainError).details.retryAfterSec).toBe(8);
    }
  });

  it('maps network failures to EXTERNAL_DEPENDENCY_FAILED', async () => {
    const fetcher = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as jest.MockedFunction<Fetcher>;
    const adapter = new SpotifySearchAdapter(fetcher);

    await expect(adapter.searchTracks('access-token', 'anything', 10)).rejects.toMatchObject({
      code: 'EXTERNAL_DEPENDENCY_FAILED',
      httpStatus: 502,
    });
  });

  it('maps malformed success responses to EXTERNAL_DEPENDENCY_FAILED', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      new Response('not-json', { status: 200 }),
    ) as jest.MockedFunction<Fetcher>;
    const adapter = new SpotifySearchAdapter(fetcher);

    await expect(adapter.searchTracks('access-token', 'anything', 10)).rejects.toMatchObject({
      code: 'EXTERNAL_DEPENDENCY_FAILED',
      httpStatus: 502,
    });
  });
});
