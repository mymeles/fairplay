import { DEFAULT_SESSION_SETTINGS } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import type {
  QueueEntryRecord,
  QueueEntryRepository,
  QueueEntryWithTrack,
} from '../queue/queue-entry.repository';
import type { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import type { PartySessionRecord } from '../sessions/session.repository';
import type { SessionService } from '../sessions/session.service';
import type {
  SpotifyPlaybackAdapter,
  SpotifyPlaybackState,
} from '../spotify-playback/spotify-playback.adapter';
import type { SpotifyTokenRefreshService } from '../spotify-playback/spotify-token-refresh.service';
import { NowPlayingService } from './now-playing.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const HOST_ID = '33333333-3333-3333-3333-333333333333';
const ENTRY_QUEUED = '44444444-4444-4444-4444-444444444444';
const ENTRY_PLAYING = '55555555-5555-5555-5555-555555555555';
const URI_QUEUED = 'spotify:track:QUEUED';
const URI_PLAYING = 'spotify:track:NOW';

const sessionRecord = (overrides: Partial<PartySessionRecord> = {}): PartySessionRecord => ({
  id: SESSION_ID,
  hostUserId: HOST_ID,
  name: null,
  joinCode: 'ABC123',
  qrTokenHash: 'h'.repeat(64),
  status: 'ACTIVE',
  selectedSpotifyDeviceId: 'dev-1',
  settings: DEFAULT_SESSION_SETTINGS,
  venueLat: null,
  venueLng: null,
  venueRadiusMeters: null,
  venueWifiHash: null,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 3_600_000),
  endedAt: null,
  ...overrides,
});

const playingRecord = (overrides: Partial<QueueEntryRecord> = {}): QueueEntryRecord => ({
  id: ENTRY_PLAYING,
  sessionId: SESSION_ID,
  trackId: 'track-playing',
  addedByGuestId: 'g',
  status: 'PLAYING',
  upvotes: 0,
  downvotes: 0,
  boostCredits: 0,
  score: 0,
  lockedUntil: null,
  hostPinned: false,
  spotifyQueuedAt: new Date(),
  playingAt: new Date(),
  playedAt: null,
  removedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const queuedWithTrack = (
  overrides: Partial<QueueEntryWithTrack> = {},
): QueueEntryWithTrack => ({
  id: ENTRY_QUEUED,
  sessionId: SESSION_ID,
  trackId: 'track-queued',
  addedByGuestId: 'g',
  status: 'QUEUED_TO_SPOTIFY',
  upvotes: 0,
  downvotes: 0,
  boostCredits: 0,
  score: 0,
  lockedUntil: null,
  hostPinned: false,
  spotifyQueuedAt: new Date(),
  playingAt: null,
  playedAt: null,
  removedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  track: {
    id: 'track-queued',
    spotifyUri: URI_QUEUED,
    spotifyTrackId: 'QUEUED',
    title: 'Queued',
    artist: 'Tester',
    durationMs: 180_000,
    explicit: false,
    createdAt: new Date(),
  },
  ...overrides,
});

const playback = (overrides: Partial<SpotifyPlaybackState> = {}): SpotifyPlaybackState => ({
  device: {
    id: 'dev-1',
    name: 'Test Device',
    type: 'Computer',
    isActive: true,
    isRestricted: false,
    isPrivateSession: false,
    volumePercent: 50,
    supportsVolume: true,
  },
  isPlaying: true,
  progressMs: 1000,
  shuffleState: false,
  repeatState: 'off',
  trackUri: URI_PLAYING,
  ...overrides,
});

const makeSessions = (record = sessionRecord()): jest.Mocked<SessionService> =>
  ({
    loadJoinable: jest.fn().mockResolvedValue(record),
  }) as unknown as jest.Mocked<SessionService>;

const makeEntries = (overrides: {
  matched?: QueueEntryWithTrack | null;
  previousPlaying?: QueueEntryRecord | null;
} = {}): jest.Mocked<QueueEntryRepository> =>
  ({
    findBySessionAndTrackUriWithTrack: jest
      .fn()
      .mockResolvedValue(overrides.matched ?? null),
    findPlayingBySession: jest
      .fn()
      .mockResolvedValue(overrides.previousPlaying ?? null),
    markPlaying: jest
      .fn()
      .mockImplementation((entryId, playingAt) =>
        Promise.resolve(playingRecord({ id: entryId, status: 'PLAYING', playingAt })),
      ),
    markPlayed: jest
      .fn()
      .mockImplementation((entryId, playedAt) =>
        Promise.resolve(playingRecord({ id: entryId, status: 'PLAYED', playedAt })),
      ),
  }) as unknown as jest.Mocked<QueueEntryRepository>;

const makeTokens = (): jest.Mocked<SpotifyTokenRefreshService> =>
  ({
    getValidAccessToken: jest.fn().mockResolvedValue('access-token'),
    forceRefresh: jest.fn().mockResolvedValue('fresh-token'),
  }) as unknown as jest.Mocked<SpotifyTokenRefreshService>;

const makeAdapter = (state: SpotifyPlaybackState | null): jest.Mocked<SpotifyPlaybackAdapter> =>
  ({
    getPlaybackState: jest.fn().mockResolvedValue(state),
  }) as unknown as jest.Mocked<SpotifyPlaybackAdapter>;

const makeRealtime = (): jest.Mocked<RealtimeEventPublisher> =>
  ({
    publishNowPlayingUpdated: jest.fn(),
  }) as unknown as jest.Mocked<RealtimeEventPublisher>;

const makeService = (opts: {
  session?: PartySessionRecord;
  state?: SpotifyPlaybackState | null;
  matched?: QueueEntryWithTrack | null;
  previousPlaying?: QueueEntryRecord | null;
} = {}) => {
  const sessions = makeSessions(opts.session ?? sessionRecord());
  const entries = makeEntries({
    matched: opts.matched,
    previousPlaying: opts.previousPlaying,
  });
  const tokens = makeTokens();
  // `null` is a meaningful value for the adapter (Spotify 204 / no active
  // playback). Don't coalesce with `??` — only fall back when `state` is
  // truly absent from opts.
  const adapter = makeAdapter('state' in opts ? (opts.state ?? null) : playback());
  const realtime = makeRealtime();
  const service = new NowPlayingService(sessions, entries, tokens, adapter, realtime);
  return { service, sessions, entries, tokens, adapter, realtime };
};

describe('NowPlayingService.syncSession', () => {
  it('transitions a matching QUEUED_TO_SPOTIFY entry to PLAYING', async () => {
    const matched = queuedWithTrack({
      track: { ...queuedWithTrack().track, spotifyUri: URI_PLAYING, spotifyTrackId: 'NOW' },
    });
    const { service, entries, realtime } = makeService({ matched });

    const result = await service.syncSession(SESSION_ID);

    expect(result.outcome).toBe('transitioned_playing');
    expect(result.entryId).toBe(matched.id);
    expect(entries.markPlaying).toHaveBeenCalledWith(matched.id);
    expect(entries.markPlayed).not.toHaveBeenCalled();
    expect(realtime.publishNowPlayingUpdated).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        state: 'playing',
        trackUri: URI_PLAYING,
        entryId: matched.id,
        isInternal: true,
      }),
    );
  });

  it('marks the previous PLAYING as PLAYED when a new track starts', async () => {
    const previousPlaying = playingRecord();
    const matched = queuedWithTrack({
      track: { ...queuedWithTrack().track, spotifyUri: URI_PLAYING, spotifyTrackId: 'NOW' },
    });
    const { service, entries } = makeService({ matched, previousPlaying });

    const result = await service.syncSession(SESSION_ID);

    expect(result.outcome).toBe('completed_previous');
    expect(entries.markPlayed).toHaveBeenCalledWith(previousPlaying.id);
    expect(entries.markPlaying).toHaveBeenCalledWith(matched.id);
  });

  it('is a no-op when Spotify is still on the same PLAYING entry', async () => {
    const matched = queuedWithTrack({
      id: ENTRY_PLAYING,
      status: 'PLAYING',
      track: { ...queuedWithTrack().track, spotifyUri: URI_PLAYING },
    });
    const { service, entries, realtime } = makeService({
      matched,
      previousPlaying: playingRecord({ id: matched.id }),
    });

    const result = await service.syncSession(SESSION_ID);

    expect(result.outcome).toBe('no_change');
    expect(entries.markPlaying).not.toHaveBeenCalled();
    expect(entries.markPlayed).not.toHaveBeenCalled();
    // Publish still happens so subscribers get a progress refresh.
    expect(realtime.publishNowPlayingUpdated).toHaveBeenCalled();
  });

  it('reports an external/manual track and completes the previous internal entry', async () => {
    const previousPlaying = playingRecord();
    const { service, entries, realtime } = makeService({
      matched: null,
      previousPlaying,
    });

    const result = await service.syncSession(SESSION_ID);

    expect(result.outcome).toBe('external_track');
    expect(result.entryId).toBeNull();
    expect(entries.markPlayed).toHaveBeenCalledWith(previousPlaying.id);
    expect(realtime.publishNowPlayingUpdated).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ state: 'playing', isInternal: false, entryId: null }),
    );
  });

  it('promotes a PENDING entry straight to PLAYING when the host plays it manually', async () => {
    const matched = queuedWithTrack({
      status: 'PENDING',
      track: { ...queuedWithTrack().track, spotifyUri: URI_PLAYING },
    });
    const { service, entries } = makeService({ matched });

    const result = await service.syncSession(SESSION_ID);

    expect(result.outcome).toBe('transitioned_playing');
    expect(entries.markPlaying).toHaveBeenCalledWith(matched.id);
  });

  it('reports paused state without transitioning anything', async () => {
    const { service, entries, realtime } = makeService({
      state: playback({ isPlaying: false }),
      previousPlaying: playingRecord(),
    });

    const result = await service.syncSession(SESSION_ID);

    expect(result.outcome).toBe('paused');
    expect(entries.markPlaying).not.toHaveBeenCalled();
    expect(entries.markPlayed).not.toHaveBeenCalled();
    expect(realtime.publishNowPlayingUpdated).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ state: 'paused' }),
    );
  });

  it('reports no_active_device when Spotify returns null (204)', async () => {
    const { service, realtime } = makeService({ state: null });
    const result = await service.syncSession(SESSION_ID);
    expect(result.outcome).toBe('no_active_device');
    expect(realtime.publishNowPlayingUpdated).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ state: 'no_active_device' }),
    );
  });

  it('reports idle when Spotify is playing but no trackUri', async () => {
    const { service, realtime } = makeService({
      state: playback({ trackUri: null }),
    });
    const result = await service.syncSession(SESSION_ID);
    expect(result.outcome).toBe('idle');
    expect(realtime.publishNowPlayingUpdated).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ state: 'idle' }),
    );
  });

  it('retries on Spotify 401 after refreshing the token', async () => {
    const matched = queuedWithTrack({
      track: { ...queuedWithTrack().track, spotifyUri: URI_PLAYING },
    });
    const { service, adapter, tokens } = makeService({ matched });
    (adapter.getPlaybackState as jest.Mock)
      .mockReset()
      .mockRejectedValueOnce(new DomainError('SPOTIFY_AUTH_FAILED', 'expired'))
      .mockResolvedValueOnce(playback());

    const result = await service.syncSession(SESSION_ID);
    expect(result.outcome).toBe('transitioned_playing');
    expect(tokens.forceRefresh).toHaveBeenCalledWith(HOST_ID);
    expect(adapter.getPlaybackState).toHaveBeenCalledTimes(2);
  });

  it('treats a persistent UNAUTHORIZED as host_disconnected', async () => {
    const { service, tokens, adapter, realtime } = makeService();
    (tokens.getValidAccessToken as jest.Mock).mockReset().mockRejectedValue(
      new DomainError('UNAUTHORIZED', 'no connection'),
    );

    const result = await service.syncSession(SESSION_ID);
    expect(result.outcome).toBe('host_disconnected');
    expect(adapter.getPlaybackState).not.toHaveBeenCalled();
    expect(realtime.publishNowPlayingUpdated).not.toHaveBeenCalled();
  });

  it('treats 429 / external dependency errors as spotify_unavailable', async () => {
    const { service, adapter } = makeService();
    (adapter.getPlaybackState as jest.Mock).mockReset().mockRejectedValue(
      new DomainError('SPOTIFY_RATE_LIMITED', 'slow'),
    );

    const result = await service.syncSession(SESSION_ID);
    expect(result.outcome).toBe('spotify_unavailable');
  });

  it('is idle when the session is no longer joinable', async () => {
    const { service, adapter } = makeService();
    (
      (service as unknown as { sessions: { loadJoinable: jest.Mock } }).sessions.loadJoinable
    ).mockRejectedValueOnce(new DomainError('SESSION_EXPIRED', 'ended'));

    const result = await service.syncSession(SESSION_ID);
    expect(result.outcome).toBe('idle');
    expect(adapter.getPlaybackState).not.toHaveBeenCalled();
  });
});
