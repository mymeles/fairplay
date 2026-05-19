import { DEFAULT_SESSION_SETTINGS, TrackDto } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import type { ModerationService } from '../moderation/moderation.service';
import type { RedisService } from '../redis/redis.service';
import type { PartySessionRecord } from '../sessions/session.repository';
import type { SessionService } from '../sessions/session.service';
import type { SpotifyTokenRefreshService } from '../spotify-playback/spotify-token-refresh.service';
import type { SpotifySearchAdapter, SpotifyTrackItemDto } from './spotify-search.adapter';
import { TrackNormalizer } from './track-normalizer';
import type { TrackRepository } from './track.repository';
import { TrackSearchService } from './track-search.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const HOST_ID = '33333333-3333-3333-3333-333333333333';

const sessionRecord = (
  overrides: Partial<PartySessionRecord> = {},
): PartySessionRecord => ({
  id: SESSION_ID,
  hostUserId: HOST_ID,
  name: null,
  joinCode: 'ABC123',
  qrTokenHash: 'h'.repeat(64),
  status: 'ACTIVE',
  selectedSpotifyDeviceId: null,
  settings: DEFAULT_SESSION_SETTINGS,
  venueLat: null,
  venueLng: null,
  venueRadiusMeters: null,
  venueWifiHash: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: new Date(Date.now() + 60_000),
  endedAt: null,
  ...overrides,
});

const spotifyTrack = (
  id: string,
  explicit = false,
  overrides: Partial<SpotifyTrackItemDto> = {},
): SpotifyTrackItemDto => ({
  id,
  uri: `spotify:track:${id}`,
  name: `Song ${id}`,
  artists: [{ name: 'Artist' }],
  album: { name: 'Album', images: [{ url: `https://img/${id}.jpg` }] },
  duration_ms: 180000,
  explicit,
  is_local: false,
  ...overrides,
});

const normalizedTrack = (id: string, explicit = false): TrackDto => ({
  spotifyUri: `spotify:track:${id}`,
  spotifyTrackId: id,
  title: `Song ${id}`,
  artist: 'Artist',
  album: 'Album',
  durationMs: 180000,
  artworkUrl: `https://img/${id}.jpg`,
  explicit,
});

const makeSessions = (
  record: PartySessionRecord = sessionRecord(),
): jest.Mocked<SessionService> =>
  ({
    loadJoinable: jest.fn().mockResolvedValue(record),
  }) as unknown as jest.Mocked<SessionService>;

const makeRefresh = (): jest.Mocked<SpotifyTokenRefreshService> =>
  ({
    getValidAccessToken: jest.fn().mockResolvedValue('AT'),
    forceRefresh: jest.fn().mockResolvedValue('AT-FRESH'),
  }) as unknown as jest.Mocked<SpotifyTokenRefreshService>;

const makeSpotify = (): jest.Mocked<SpotifySearchAdapter> =>
  ({
    searchTracks: jest.fn(),
  }) as unknown as jest.Mocked<SpotifySearchAdapter>;

const makeTracks = (): jest.Mocked<TrackRepository> =>
  ({
    upsert: jest.fn().mockImplementation((track: TrackDto) =>
      Promise.resolve({ id: 'track-row-1', ...track, createdAt: new Date() }),
    ),
  }) as unknown as jest.Mocked<TrackRepository>;

const makeRedis = () => {
  const client = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    ttl: jest.fn().mockResolvedValue(-1),
  };
  const redis = {
    getClient: jest.fn().mockReturnValue(client),
  } as unknown as jest.Mocked<RedisService>;
  return { redis, client };
};

const makeModeration = (): jest.Mocked<ModerationService> =>
  ({
    assertGuestCanSearch: jest.fn().mockResolvedValue(undefined),
    assertTrackAllowed: jest.fn().mockResolvedValue(undefined),
    filterAllowedTracks: jest.fn().mockImplementation(
      async (
        _sessionId: string,
        tracks: TrackDto[],
        options: { allowExplicitTracks: boolean },
      ) => (options.allowExplicitTracks ? tracks : tracks.filter((track) => !track.explicit)),
    ),
  }) as unknown as jest.Mocked<ModerationService>;

const makeService = (record: PartySessionRecord = sessionRecord()) => {
  const sessions = makeSessions(record);
  const refresh = makeRefresh();
  const spotify = makeSpotify();
  const tracks = makeTracks();
  const { redis, client } = makeRedis();
  const moderation = makeModeration();
  const service = new TrackSearchService(
    sessions,
    refresh,
    spotify,
    new TrackNormalizer(),
    tracks,
    redis,
    moderation,
  );
  return { service, sessions, refresh, spotify, tracks, client, moderation };
};

describe('TrackSearchService.search', () => {
  it('rejects an empty search query before loading the session', async () => {
    const { service, sessions } = makeService();
    await expect(service.search(SESSION_ID, GUEST_ID, '   ')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(sessions.loadJoinable).not.toHaveBeenCalled();
  });

  it('returns cached normalized results without calling Spotify', async () => {
    const { service, refresh, spotify, client, moderation } = makeService();
    client.get.mockResolvedValueOnce(JSON.stringify([normalizedTrack('cached')]));

    const result = await service.search(SESSION_ID, GUEST_ID, 'dua');

    expect(result).toEqual([normalizedTrack('cached')]);
    expect(moderation.assertGuestCanSearch).toHaveBeenCalledWith(SESSION_ID, GUEST_ID);
    expect(refresh.getValidAccessToken).not.toHaveBeenCalled();
    expect(spotify.searchTracks).not.toHaveBeenCalled();
  });

  it('uses the host token, filters explicit tracks when disabled, and caches results', async () => {
    const { service, refresh, spotify, client, moderation } = makeService(
      sessionRecord({
        settings: { ...DEFAULT_SESSION_SETTINGS, allowExplicitTracks: false },
      }),
    );
    spotify.searchTracks.mockResolvedValue([
      spotifyTrack('clean', false),
      spotifyTrack('explicit', true),
    ]);

    const result = await service.search(SESSION_ID, GUEST_ID, 'party');

    expect(refresh.getValidAccessToken).toHaveBeenCalledWith(HOST_ID);
    expect(spotify.searchTracks).toHaveBeenCalledWith('AT', 'party', 10);
    expect(result).toEqual([normalizedTrack('clean', false)]);
    expect(moderation.filterAllowedTracks).toHaveBeenCalledWith(
      SESSION_ID,
      [normalizedTrack('clean', false), normalizedTrack('explicit', true)],
      { allowExplicitTracks: false },
    );
    expect(client.set).toHaveBeenCalledWith(
      expect.stringContaining(`party:${SESSION_ID}:track-search:clean:`),
      JSON.stringify([normalizedTrack('clean', false)]),
      'EX',
      60,
    );
  });

  it('keeps explicit tracks when the session allows them', async () => {
    const { service, spotify } = makeService();
    spotify.searchTracks.mockResolvedValue([
      spotifyTrack('clean', false),
      spotifyTrack('explicit', true),
    ]);

    const result = await service.search(SESSION_ID, GUEST_ID, 'party');

    expect(result.map((track) => track.spotifyTrackId)).toEqual(['clean', 'explicit']);
  });

  it('forces a token refresh and retries once on Spotify 401', async () => {
    const { service, refresh, spotify } = makeService();
    spotify.searchTracks
      .mockRejectedValueOnce(new DomainError('SPOTIFY_AUTH_FAILED', 'expired'))
      .mockResolvedValueOnce([spotifyTrack('fresh')]);

    const result = await service.search(SESSION_ID, GUEST_ID, 'fresh');

    expect(refresh.forceRefresh).toHaveBeenCalledWith(HOST_ID);
    expect(spotify.searchTracks).toHaveBeenNthCalledWith(2, 'AT-FRESH', 'fresh', 10);
    expect(result).toEqual([normalizedTrack('fresh')]);
  });

  it('stores a Redis backoff when Spotify returns 429', async () => {
    const { service, spotify, client } = makeService();
    spotify.searchTracks.mockRejectedValue(
      new DomainError('SPOTIFY_RATE_LIMITED', 'limited', { retryAfterSec: 7 }),
    );

    await expect(service.search(SESSION_ID, GUEST_ID, 'rate')).rejects.toMatchObject({
      code: 'SPOTIFY_RATE_LIMITED',
    });
    expect(client.set).toHaveBeenCalledWith(
      `spotify:search:backoff:${HOST_ID}`,
      '1',
      'EX',
      7,
    );
  });

  it('honors long Spotify search retry windows', async () => {
    const { service, spotify, client } = makeService();
    spotify.searchTracks.mockRejectedValue(
      new DomainError('SPOTIFY_RATE_LIMITED', 'limited', { retryAfterSec: 21_000 }),
    );

    await expect(service.search(SESSION_ID, GUEST_ID, 'rate')).rejects.toMatchObject({
      code: 'SPOTIFY_RATE_LIMITED',
    });
    expect(client.set).toHaveBeenCalledWith(
      `spotify:search:backoff:${HOST_ID}`,
      '1',
      'EX',
      21_000,
    );
  });

  it('short-circuits while a Spotify search backoff key is active', async () => {
    const { service, refresh, spotify, client } = makeService();
    client.get.mockResolvedValueOnce(null).mockResolvedValueOnce('1');
    client.ttl.mockResolvedValueOnce(5);

    await expect(service.search(SESSION_ID, GUEST_ID, 'rate')).rejects.toMatchObject({
      code: 'SPOTIFY_RATE_LIMITED',
      details: { retryAfterSec: 5 },
    });
    expect(refresh.getValidAccessToken).not.toHaveBeenCalled();
    expect(spotify.searchTracks).not.toHaveBeenCalled();
  });
});

describe('TrackSearchService.normalizeTrack', () => {
  it('normalizes and stores one Spotify track', async () => {
    const { service, tracks, moderation } = makeService();
    const result = await service.normalizeTrack(SESSION_ID, GUEST_ID, spotifyTrack('abc'));

    expect(result).toEqual(normalizedTrack('abc'));
    expect(moderation.assertTrackAllowed).toHaveBeenCalledWith(
      SESSION_ID,
      normalizedTrack('abc'),
      { allowExplicitTracks: true },
    );
    expect(tracks.upsert).toHaveBeenCalledWith(normalizedTrack('abc'));
  });

  it('rejects Spotify tracks that cannot be normalized', async () => {
    const { service, tracks } = makeService();
    await expect(
      service.normalizeTrack(SESSION_ID, GUEST_ID, spotifyTrack('local', false, { is_local: true })),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(tracks.upsert).not.toHaveBeenCalled();
  });
});
