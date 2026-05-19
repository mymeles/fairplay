import { DEFAULT_SESSION_SETTINGS } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import type { GuestRepository } from '../guests/guest.repository';
import type { ModerationService } from '../moderation/moderation.service';
import type { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import { ScoringService } from '../scoring/scoring.service';
import type { PartySessionRecord } from '../sessions/session.repository';
import type { SessionService } from '../sessions/session.service';
import type { SpotifyTrackItemDto } from '../tracks/spotify-search.adapter';
import { TrackNormalizer } from '../tracks/track-normalizer';
import type { TrackRecord, TrackRepository } from '../tracks/track.repository';
import type {
  QueueEntryRecord,
  QueueEntryRepository,
  QueueEntryWithTrack,
} from './queue-entry.repository';
import { QueueService } from './queue.service';
import type { RedisQueueRepository } from './redis-queue.repository';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const HOST_ID = '33333333-3333-3333-3333-333333333333';
const TRACK_ROW_ID = '44444444-4444-4444-4444-444444444444';
const ENTRY_ID = '55555555-5555-5555-5555-555555555555';

const spotifyTrack = (
  id = 'abc123',
  overrides: Partial<SpotifyTrackItemDto> = {},
): SpotifyTrackItemDto => ({
  id,
  uri: `spotify:track:${id}`,
  name: `Song ${id}`,
  artists: [{ name: 'Artist' }],
  album: { name: 'Album', images: [{ url: `https://img/${id}.jpg` }] },
  duration_ms: 180_000,
  explicit: false,
  is_local: false,
  ...overrides,
});

const sessionRecord = (overrides: Partial<PartySessionRecord> = {}): PartySessionRecord => ({
  id: SESSION_ID,
  hostUserId: HOST_ID,
  joinCode: 'ABC123',
  qrTokenHash: 'h'.repeat(64),
  status: 'ACTIVE',
  selectedSpotifyDeviceId: null,
  settings: { ...DEFAULT_SESSION_SETTINGS },
  venueLat: null,
  venueLng: null,
  venueRadiusMeters: null,
  venueWifiHash: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: new Date(Date.now() + 60_000),
  endedAt: null,
  ...overrides,
});

const trackRow = (overrides: Partial<TrackRecord> = {}): TrackRecord => ({
  id: TRACK_ROW_ID,
  spotifyUri: 'spotify:track:abc123',
  spotifyTrackId: 'abc123',
  title: 'Song abc123',
  artist: 'Artist',
  album: 'Album',
  durationMs: 180_000,
  artworkUrl: 'https://img/abc123.jpg',
  explicit: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const queueRow = (overrides: Partial<QueueEntryRecord> = {}): QueueEntryRecord => ({
  id: ENTRY_ID,
  sessionId: SESSION_ID,
  trackId: TRACK_ROW_ID,
  addedByGuestId: GUEST_ID,
  status: 'PENDING',
  upvotes: 0,
  downvotes: 0,
  boostCredits: 0,
  score: 0,
  lockedUntil: null,
  hostPinned: false,
  spotifyQueuedAt: null,
  playingAt: null,
  playedAt: null,
  removedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const queueRowWithTrack = (overrides: Partial<QueueEntryWithTrack> = {}): QueueEntryWithTrack => ({
  ...queueRow(),
  track: trackRow(),
  ...overrides,
});

const makeSessions = (record: PartySessionRecord = sessionRecord()): jest.Mocked<SessionService> =>
  ({
    loadJoinable: jest.fn().mockResolvedValue(record),
    getSession: jest.fn().mockResolvedValue(record),
  }) as unknown as jest.Mocked<SessionService>;

const makeTracks = (): jest.Mocked<TrackRepository> =>
  ({
    upsert: jest.fn().mockResolvedValue(trackRow()),
  }) as unknown as jest.Mocked<TrackRepository>;

const makeEntries = (): jest.Mocked<QueueEntryRepository> =>
  ({
    create: jest.fn().mockResolvedValue(queueRow()),
    findById: jest.fn(),
    findByIdWithTrack: jest.fn(),
    listBySessionWithTrack: jest.fn().mockResolvedValue([]),
    countActiveByGuest: jest.fn().mockResolvedValue(0),
    findRecentForTrack: jest.fn().mockResolvedValue(null),
    markRemoved: jest.fn().mockResolvedValue(queueRow({ status: 'REMOVED' })),
  }) as unknown as jest.Mocked<QueueEntryRepository>;

const makeRedisQueue = (): jest.Mocked<RedisQueueRepository> =>
  ({
    addPending: jest.fn().mockResolvedValue(undefined),
    removeEntry: jest.fn().mockResolvedValue(undefined),
    listPendingIds: jest.fn().mockResolvedValue([]),
  }) as unknown as jest.Mocked<RedisQueueRepository>;

const makeGuests = (): jest.Mocked<GuestRepository> =>
  ({
    findById: jest.fn().mockResolvedValue({
      id: GUEST_ID,
      sessionId: SESSION_ID,
      displayName: 'Alice',
      deviceHash: null,
      role: 'GUEST',
      status: 'ACTIVE',
      joinedAt: new Date('2026-01-01T00:00:00Z'),
      lastSeenAt: null,
    }),
    findDisplayNamesByIds: jest.fn().mockResolvedValue(new Map([[GUEST_ID, 'Alice']])),
  }) as unknown as jest.Mocked<GuestRepository>;

const makeRealtime = (): jest.Mocked<RealtimeEventPublisher> =>
  ({
    publishQueueUpdated: jest.fn(),
  }) as unknown as jest.Mocked<RealtimeEventPublisher>;

const makeModeration = (): jest.Mocked<ModerationService> =>
  ({
    assertGuestCanMutateQueue: jest.fn().mockResolvedValue(undefined),
    assertGuestCanReadQueue: jest.fn().mockResolvedValue(undefined),
    assertTrackAllowed: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<ModerationService>;

const makeService = (record: PartySessionRecord = sessionRecord()) => {
  const sessions = makeSessions(record);
  const tracks = makeTracks();
  const entries = makeEntries();
  const redisQueue = makeRedisQueue();
  const scoring = new ScoringService();
  const guests = makeGuests();
  const moderation = makeModeration();
  const realtime = makeRealtime();
  const service = new QueueService(
    sessions,
    tracks,
    new TrackNormalizer(),
    entries,
    redisQueue,
    scoring,
    guests,
    moderation,
    realtime,
  );
  return { service, sessions, tracks, entries, redisQueue, guests, moderation, realtime };
};

describe('QueueService.addTrack', () => {
  it('upserts the track, creates the entry, and pushes to Redis ZSET', async () => {
    const { service, sessions, tracks, entries, redisQueue, moderation, realtime } = makeService();

    const result = await service.addTrack(SESSION_ID, GUEST_ID, spotifyTrack());

    expect(sessions.loadJoinable).toHaveBeenCalledWith(SESSION_ID);
    expect(moderation.assertGuestCanMutateQueue).toHaveBeenCalledWith(
      SESSION_ID,
      GUEST_ID,
      'queue_add',
    );
    expect(tracks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        spotifyUri: 'spotify:track:abc123',
        spotifyTrackId: 'abc123',
        title: 'Song abc123',
      }),
    );
    expect(entries.create).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      trackId: TRACK_ROW_ID,
      addedByGuestId: GUEST_ID,
      score: 0,
    });
    expect(redisQueue.addPending).toHaveBeenCalledWith(SESSION_ID, ENTRY_ID, 0);
    expect(realtime.publishQueueUpdated).toHaveBeenCalledWith(SESSION_ID, {
      reason: 'entry_added',
      entryId: ENTRY_ID,
      status: 'PENDING',
    });
    expect(result.id).toBe(ENTRY_ID);
    expect(result.score).toBe(0);
    expect(result.status).toBe('PENDING');
    expect(result.track.spotifyUri).toBe('spotify:track:abc123');
  });

  it('rejects an unnormalizable Spotify track before touching the DB', async () => {
    const { service, tracks, entries, redisQueue } = makeService();

    await expect(
      service.addTrack(SESSION_ID, GUEST_ID, spotifyTrack('local', { is_local: true })),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(tracks.upsert).not.toHaveBeenCalled();
    expect(entries.create).not.toHaveBeenCalled();
    expect(redisQueue.addPending).not.toHaveBeenCalled();
  });

  it('rejects explicit tracks when the session disallows them', async () => {
    const { service, tracks, moderation } = makeService(
      sessionRecord({
        settings: { ...DEFAULT_SESSION_SETTINGS, allowExplicitTracks: false },
      }),
    );
    moderation.assertTrackAllowed.mockRejectedValueOnce(
      new DomainError('VALIDATION_FAILED', 'explicit'),
    );

    await expect(
      service.addTrack(SESSION_ID, GUEST_ID, spotifyTrack('dirty', { explicit: true })),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(tracks.upsert).not.toHaveBeenCalled();
  });

  it('enforces the per-guest suggestion cap', async () => {
    const { service, entries, redisQueue } = makeService(
      sessionRecord({
        settings: { ...DEFAULT_SESSION_SETTINGS, maxSuggestionsPerGuest: 2 },
      }),
    );
    (entries.countActiveByGuest as jest.Mock).mockResolvedValueOnce(2);

    await expect(service.addTrack(SESSION_ID, GUEST_ID, spotifyTrack())).rejects.toMatchObject({
      code: 'CONFLICT',
      details: expect.objectContaining({ maxSuggestions: 2 }),
    });
    expect(entries.create).not.toHaveBeenCalled();
    expect(redisQueue.addPending).not.toHaveBeenCalled();
  });

  it('rejects duplicates inside the cooldown window', async () => {
    const { service, entries, redisQueue } = makeService();
    (entries.findRecentForTrack as jest.Mock).mockResolvedValueOnce(
      queueRow({ status: 'PENDING' }),
    );

    await expect(service.addTrack(SESSION_ID, GUEST_ID, spotifyTrack())).rejects.toMatchObject({
      code: 'CONFLICT',
      details: expect.objectContaining({ existingStatus: 'PENDING' }),
    });
    expect(entries.create).not.toHaveBeenCalled();
    expect(redisQueue.addPending).not.toHaveBeenCalled();
  });

  it('passes the cooldown cutoff derived from session settings', async () => {
    const { service, entries } = makeService(
      sessionRecord({
        settings: { ...DEFAULT_SESSION_SETTINGS, duplicateCooldownSeconds: 60 },
      }),
    );

    await service.addTrack(SESSION_ID, GUEST_ID, spotifyTrack());

    expect(entries.findRecentForTrack).toHaveBeenCalledWith(
      SESSION_ID,
      TRACK_ROW_ID,
      expect.any(Date),
    );
    const cutoff = (entries.findRecentForTrack as jest.Mock).mock.calls[0][2] as Date;
    const delta = Date.now() - cutoff.getTime();
    expect(delta).toBeGreaterThanOrEqual(60_000 - 1000);
    expect(delta).toBeLessThanOrEqual(60_000 + 1000);
  });

  it('refuses to add tracks to an ended session', async () => {
    const sessions = makeSessions();
    sessions.loadJoinable = jest
      .fn()
      .mockRejectedValue(new DomainError('SESSION_EXPIRED', 'ended'));
    const tracks = makeTracks();
    const entries = makeEntries();
    const redisQueue = makeRedisQueue();
    const service = new QueueService(
      sessions,
      tracks,
      new TrackNormalizer(),
      entries,
      redisQueue,
      new ScoringService(),
      makeGuests(),
      makeModeration(),
    );

    await expect(service.addTrack(SESSION_ID, GUEST_ID, spotifyTrack())).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    expect(tracks.upsert).not.toHaveBeenCalled();
    expect(entries.create).not.toHaveBeenCalled();
    expect(redisQueue.addPending).not.toHaveBeenCalled();
  });
});

describe('QueueService.listSession', () => {
  it('returns ordered queue entries with track metadata', async () => {
    const { service, entries } = makeService();
    (entries.listBySessionWithTrack as jest.Mock).mockResolvedValueOnce([
      queueRowWithTrack({
        id: 'e1' + ENTRY_ID.slice(2),
        score: 10,
        track: trackRow({ spotifyTrackId: 't1' }),
      }),
      queueRowWithTrack({
        id: 'e2' + ENTRY_ID.slice(2),
        score: 5,
        track: trackRow({ spotifyTrackId: 't2' }),
      }),
    ]);

    const result = await service.listSession(SESSION_ID, GUEST_ID);

    expect(result.map((entry) => entry.track.spotifyTrackId)).toEqual(['t1', 't2']);
    expect(result.map((entry) => entry.score)).toEqual([10, 5]);
    expect(result.map((entry) => entry.addedByGuestDisplayName)).toEqual(['Alice', 'Alice']);
  });
});

describe('QueueService.listSessionForHost', () => {
  it('verifies host session ownership and returns rows without the guest moderation gate', async () => {
    const { service, entries, sessions, moderation } = makeService();
    (entries.listBySessionWithTrack as jest.Mock).mockResolvedValueOnce([
      queueRowWithTrack({ score: 7 }),
    ]);

    const result = await service.listSessionForHost(SESSION_ID, HOST_ID);

    expect(sessions.getSession).toHaveBeenCalledWith(SESSION_ID, HOST_ID);
    expect(entries.listBySessionWithTrack).toHaveBeenCalledWith(SESSION_ID);
    expect(moderation.assertGuestCanReadQueue).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]?.score).toBe(7);
  });
});

describe('QueueService.removeOwnEntry', () => {
  it('marks a pending entry removed and clears it from Redis', async () => {
    const { service, entries, redisQueue, realtime } = makeService();
    (entries.findByIdWithTrack as jest.Mock).mockResolvedValueOnce(queueRowWithTrack());

    const result = await service.removeOwnEntry(ENTRY_ID, GUEST_ID);

    expect(entries.markRemoved).toHaveBeenCalledWith(ENTRY_ID);
    expect(redisQueue.removeEntry).toHaveBeenCalledWith(SESSION_ID, ENTRY_ID);
    expect(realtime.publishQueueUpdated).toHaveBeenCalledWith(SESSION_ID, {
      reason: 'entry_removed',
      entryId: ENTRY_ID,
      status: 'REMOVED',
    });
    expect(result.status).toBe('REMOVED');
  });

  it('404s for an unknown entry', async () => {
    const { service } = makeService();
    await expect(service.removeOwnEntry(ENTRY_ID, GUEST_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it("forbids removing another guest's entry", async () => {
    const { service, entries } = makeService();
    (entries.findByIdWithTrack as jest.Mock).mockResolvedValueOnce(
      queueRowWithTrack({ addedByGuestId: '99999999-9999-9999-9999-999999999999' }),
    );

    await expect(service.removeOwnEntry(ENTRY_ID, GUEST_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(entries.markRemoved).not.toHaveBeenCalled();
  });

  it('refuses to remove a non-pending entry', async () => {
    const { service, entries, redisQueue } = makeService();
    (entries.findByIdWithTrack as jest.Mock).mockResolvedValueOnce(
      queueRowWithTrack({ status: 'LOCKED' }),
    );

    await expect(service.removeOwnEntry(ENTRY_ID, GUEST_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(entries.markRemoved).not.toHaveBeenCalled();
    expect(redisQueue.removeEntry).not.toHaveBeenCalled();
  });
});
