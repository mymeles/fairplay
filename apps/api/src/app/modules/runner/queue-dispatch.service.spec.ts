import { DEFAULT_SESSION_SETTINGS } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import type {
  QueueEntryRepository,
  QueueEntryWithTrack,
} from '../queue/queue-entry.repository';
import type { RedisQueueRepository } from '../queue/redis-queue.repository';
import type { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import type { PartySessionRecord } from '../sessions/session.repository';
import type { SessionService } from '../sessions/session.service';
import type { SpotifyTokenRefreshService } from '../spotify-playback/spotify-token-refresh.service';
import { QueueDispatchService } from './queue-dispatch.service';
import { RunnerStateService } from './runner-state.service';
import { SpotifyCircuitBreaker } from './spotify-circuit-breaker';
import type { SpotifyQueueAdapter } from './spotify-queue.adapter';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const HOST_ID = '33333333-3333-3333-3333-333333333333';
const ENTRY_ID = '44444444-4444-4444-4444-444444444444';

const sessionRecord = (overrides: Partial<PartySessionRecord> = {}): PartySessionRecord => ({
  id: SESSION_ID,
  hostUserId: HOST_ID,
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

const entryWithTrack = (overrides: Partial<QueueEntryWithTrack> = {}): QueueEntryWithTrack => ({
  id: ENTRY_ID,
  sessionId: SESSION_ID,
  trackId: 'track-1',
  addedByGuestId: 'guest-1',
  status: 'PENDING',
  upvotes: 0,
  downvotes: 0,
  boostCredits: 0,
  score: 1,
  lockedUntil: null,
  hostPinned: false,
  spotifyQueuedAt: null,
  playingAt: null,
  playedAt: null,
  removedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  track: {
    id: 'track-1',
    spotifyUri: 'spotify:track:M12',
    spotifyTrackId: 'M12',
    title: 'Test',
    artist: 'Tester',
    durationMs: 180_000,
    explicit: false,
    createdAt: new Date(),
  },
  ...overrides,
});

const makeSessions = (record = sessionRecord()): jest.Mocked<SessionService> =>
  ({
    loadJoinable: jest.fn().mockResolvedValue(record),
  }) as unknown as jest.Mocked<SessionService>;

const makeEntries = (
  candidate: QueueEntryWithTrack | null = entryWithTrack(),
  buffered = 0,
): jest.Mocked<QueueEntryRepository> => {
  const finder = jest.fn().mockResolvedValue(candidate);
  return {
    countSpotifyBufferedBySession: jest.fn().mockResolvedValue(buffered),
    listPendingByIdsWithTrack: jest
      .fn()
      .mockResolvedValue(candidate ? [candidate] : []),
    findByIdWithTrack: finder,
    markQueuedToSpotify: jest.fn().mockImplementation((entryId, queuedAt) =>
      Promise.resolve({
        ...(candidate ?? entryWithTrack()),
        id: entryId,
        status: 'QUEUED_TO_SPOTIFY' as const,
        spotifyQueuedAt: queuedAt,
      }),
    ),
  } as unknown as jest.Mocked<QueueEntryRepository>;
};

const makeRedis = (lockGranted = true): jest.Mocked<RedisQueueRepository> =>
  ({
    listTopPendingIds: jest.fn().mockResolvedValue([ENTRY_ID]),
    acquireDispatchLock: jest.fn().mockResolvedValue(lockGranted),
    releaseDispatchLock: jest.fn().mockResolvedValue(undefined),
    removeEntry: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<RedisQueueRepository>;

const makeTokenRefresh = (): jest.Mocked<SpotifyTokenRefreshService> =>
  ({
    getValidAccessToken: jest.fn().mockResolvedValue('access-token'),
    forceRefresh: jest.fn().mockResolvedValue('fresh-token'),
  }) as unknown as jest.Mocked<SpotifyTokenRefreshService>;

const makeAdapter = (): jest.Mocked<SpotifyQueueAdapter> =>
  ({
    enqueueTrack: jest.fn().mockResolvedValue(undefined),
    getQueue: jest.fn().mockResolvedValue(null),
  }) as unknown as jest.Mocked<SpotifyQueueAdapter>;

const makeRealtime = (): jest.Mocked<RealtimeEventPublisher> =>
  ({
    publishTrackQueuedToSpotify: jest.fn(),
    publishQueueUpdated: jest.fn(),
    publishRunnerStatusChanged: jest.fn(),
  }) as unknown as jest.Mocked<RealtimeEventPublisher>;

const makeService = (overrides: {
  session?: PartySessionRecord;
  candidate?: QueueEntryWithTrack | null;
  buffered?: number;
  lockGranted?: boolean;
} = {}) => {
  const sessions = makeSessions(overrides.session ?? sessionRecord());
  const entries = makeEntries(
    overrides.candidate === undefined ? entryWithTrack() : overrides.candidate,
    overrides.buffered ?? 0,
  );
  const redis = makeRedis(overrides.lockGranted ?? true);
  const tokenRefresh = makeTokenRefresh();
  const adapter = makeAdapter();
  const breaker = new SpotifyCircuitBreaker();
  const realtime = makeRealtime();
  const state = new RunnerStateService(realtime);
  const service = new QueueDispatchService(
    sessions,
    entries,
    redis,
    tokenRefresh,
    adapter,
    breaker,
    state,
    realtime,
  );
  return { service, sessions, entries, redis, tokenRefresh, adapter, breaker, state, realtime };
};

describe('QueueDispatchService.dispatchNextForSession', () => {
  it('appends the top PENDING entry, marks QUEUED_TO_SPOTIFY, and publishes', async () => {
    const { service, entries, redis, adapter, realtime, state } = makeService();
    const result = await service.dispatchNextForSession(SESSION_ID);

    expect(result.outcome).toBe('dispatched');
    expect(result.entryId).toBe(ENTRY_ID);
    expect(adapter.enqueueTrack).toHaveBeenCalledWith('access-token', 'spotify:track:M12', 'dev-1');
    expect(entries.markQueuedToSpotify).toHaveBeenCalledWith(ENTRY_ID, expect.any(Date));
    expect(redis.removeEntry).toHaveBeenCalledWith(SESSION_ID, ENTRY_ID);
    expect(realtime.publishTrackQueuedToSpotify).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ entryId: ENTRY_ID, trackUri: 'spotify:track:M12' }),
    );
    expect(realtime.publishQueueUpdated).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ reason: 'entry_queued_to_spotify' }),
    );
    expect(state.snapshot(SESSION_ID).status).toBe('ACTIVE');
  });

  it('skips when the Spotify buffer is already full', async () => {
    const { service, adapter, entries } = makeService({ buffered: 1 });
    const result = await service.dispatchNextForSession(SESSION_ID);
    expect(result.outcome).toBe('buffer_full');
    expect(adapter.enqueueTrack).not.toHaveBeenCalled();
    expect(entries.markQueuedToSpotify).not.toHaveBeenCalled();
  });

  it('skips when there is no PENDING entry', async () => {
    const { service, adapter } = makeService({ candidate: null });
    const result = await service.dispatchNextForSession(SESSION_ID);
    expect(result.outcome).toBe('no_pending');
    expect(adapter.enqueueTrack).not.toHaveBeenCalled();
  });

  it('does not dispatch a LOCKED entry — second read inside the lock catches the change', async () => {
    const candidate = entryWithTrack();
    const { service, entries, adapter } = makeService({ candidate });
    // The Redis ZSET still says it's pending, but the row is now LOCKED.
    (entries.findByIdWithTrack as jest.Mock).mockResolvedValueOnce(
      entryWithTrack({ status: 'LOCKED' }),
    );
    const result = await service.dispatchNextForSession(SESSION_ID);
    expect(result.outcome).toBe('no_pending');
    expect(adapter.enqueueTrack).not.toHaveBeenCalled();
  });

  it('skips when the dispatch lock is contended', async () => {
    const { service, adapter } = makeService({ lockGranted: false });
    const result = await service.dispatchNextForSession(SESSION_ID);
    expect(result.outcome).toBe('error');
    expect(result.errorCode).toBe('lock_contention');
    expect(adapter.enqueueTrack).not.toHaveBeenCalled();
  });

  it('refreshes the token once on 401 and retries successfully', async () => {
    const { service, adapter, tokenRefresh } = makeService();
    (adapter.enqueueTrack as jest.Mock)
      .mockRejectedValueOnce(new DomainError('SPOTIFY_AUTH_FAILED', 'expired'))
      .mockResolvedValueOnce(undefined);

    const result = await service.dispatchNextForSession(SESSION_ID);
    expect(result.outcome).toBe('dispatched');
    expect(tokenRefresh.forceRefresh).toHaveBeenCalledWith(HOST_ID);
    expect(adapter.enqueueTrack).toHaveBeenCalledTimes(2);
    expect(adapter.enqueueTrack).toHaveBeenLastCalledWith(
      'fresh-token',
      'spotify:track:M12',
      'dev-1',
    );
  });

  it('disables the runner on persistent 401', async () => {
    const { service, adapter, state } = makeService();
    (adapter.enqueueTrack as jest.Mock).mockRejectedValue(
      new DomainError('SPOTIFY_AUTH_FAILED', 'invalid'),
    );
    const result = await service.dispatchNextForSession(SESSION_ID);
    expect(result.outcome).toBe('auth_failed');
    expect(state.isEnabled(SESSION_ID)).toBe(false);
  });

  it('disables the runner on 403 premium_required', async () => {
    const { service, adapter, state, breaker } = makeService();
    (adapter.enqueueTrack as jest.Mock).mockRejectedValue(
      new DomainError('SPOTIFY_PREMIUM_REQUIRED', 'premium'),
    );
    const result = await service.dispatchNextForSession(SESSION_ID);
    expect(result.outcome).toBe('premium_required');
    expect(state.isEnabled(SESSION_ID)).toBe(false);
    expect(breaker.snapshot(HOST_ID).state).toBe('OPEN');
  });

  it('disables the runner on 404 no active device', async () => {
    const { service, adapter, state } = makeService();
    (adapter.enqueueTrack as jest.Mock).mockRejectedValue(
      new DomainError('SPOTIFY_NO_ACTIVE_DEVICE', 'no device'),
    );
    const result = await service.dispatchNextForSession(SESSION_ID);
    expect(result.outcome).toBe('no_device');
    expect(state.isEnabled(SESSION_ID)).toBe(false);
  });

  it('honors 429 Retry-After by setting backoff + opening the breaker', async () => {
    const { service, adapter, state, breaker } = makeService();
    (adapter.enqueueTrack as jest.Mock).mockRejectedValue(
      new DomainError('SPOTIFY_RATE_LIMITED', 'slow down', { retryAfterSec: 5 }),
    );
    const result = await service.dispatchNextForSession(SESSION_ID);
    expect(result.outcome).toBe('rate_limited');
    expect(result.retryAtMs).toBeGreaterThan(Date.now());
    expect(state.snapshot(SESSION_ID).status).toBe('BACKING_OFF');
    expect(breaker.snapshot(HOST_ID).state).toBe('OPEN');
  });

  it('refuses to dispatch while the runner is backing off', async () => {
    const { service, adapter, state } = makeService();
    state.markBackingOff(SESSION_ID, 'rate_limited', Date.now() + 60_000);
    const result = await service.dispatchNextForSession(SESSION_ID);
    expect(result.outcome).toBe('rate_limited');
    expect(adapter.enqueueTrack).not.toHaveBeenCalled();
  });

  it('refuses to dispatch while the circuit breaker is open', async () => {
    const { service, adapter, breaker } = makeService();
    breaker.forceOpen(HOST_ID, 60_000);
    const result = await service.dispatchNextForSession(SESSION_ID);
    expect(result.outcome).toBe('circuit_open');
    expect(adapter.enqueueTrack).not.toHaveBeenCalled();
  });

  it('forgets state and returns session_invalid when the session is gone', async () => {
    const { service, adapter, state } = makeService();
    (
      (service as unknown as { sessions: { loadJoinable: jest.Mock } }).sessions.loadJoinable
    ).mockRejectedValueOnce(new DomainError('SESSION_EXPIRED', 'ended'));
    state.markActive(SESSION_ID, 'e1'); // seed some state
    const result = await service.dispatchNextForSession(SESSION_ID);
    expect(result.outcome).toBe('session_invalid');
    expect(adapter.enqueueTrack).not.toHaveBeenCalled();
  });
});
