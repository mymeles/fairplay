import { DEFAULT_SESSION_SETTINGS } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import type { QueueEntryRecord, QueueEntryRepository } from '../queue/queue-entry.repository';
import type { RedisQueueRepository } from '../queue/redis-queue.repository';
import type { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import type { ScoreRebuildService } from '../scoring/score-rebuild.service';
import type { PartySessionRecord } from '../sessions/session.repository';
import type { SessionService } from '../sessions/session.service';
import { LockWindowService } from './lock-window.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const HOST_ID = '22222222-2222-2222-2222-222222222222';
const ENTRY_1 = '33333333-3333-3333-3333-333333333333';
const ENTRY_2 = '44444444-4444-4444-4444-444444444444';
const ENTRY_3 = '55555555-5555-5555-5555-555555555555';
const NOW = new Date('2026-01-01T00:00:00.000Z');

const sessionRecord = (overrides: Partial<PartySessionRecord> = {}): PartySessionRecord => ({
  id: SESSION_ID,
  hostUserId: HOST_ID,
  joinCode: 'ABC123',
  qrTokenHash: 'h'.repeat(64),
  status: 'ACTIVE',
  selectedSpotifyDeviceId: null,
  settings: { ...DEFAULT_SESSION_SETTINGS, lockSize: 2, lockDurationSeconds: 90 },
  venueLat: null,
  venueLng: null,
  venueRadiusMeters: null,
  venueWifiHash: null,
  createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + 3600_000),
  endedAt: null,
  ...overrides,
});

const entry = (overrides: Partial<QueueEntryRecord> = {}): QueueEntryRecord => ({
  id: ENTRY_1,
  sessionId: SESSION_ID,
  trackId: '66666666-6666-6666-6666-666666666666',
  addedByGuestId: '77777777-7777-7777-7777-777777777777',
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
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeSessions = (): jest.Mocked<SessionService> =>
  ({
    loadJoinable: jest.fn().mockResolvedValue(sessionRecord()),
    getSession: jest.fn().mockResolvedValue({ id: SESSION_ID, hostUserId: HOST_ID }),
  }) as unknown as jest.Mocked<SessionService>;

const makeEntries = (): jest.Mocked<QueueEntryRepository> =>
  ({
    countActiveLocks: jest.fn().mockResolvedValue(0),
    listPendingByIds: jest
      .fn()
      .mockImplementation(async (_sessionId, ids: string[]) =>
        ids.map((id, index) => entry({ id, score: 10 - index })),
      ),
    lockEntry: jest
      .fn()
      .mockImplementation(async (id: string, lockedUntil: Date) =>
        entry({ id, status: 'LOCKED', lockedUntil }),
      ),
    listExpiredLocks: jest.fn().mockResolvedValue([]),
    unlockEntry: jest
      .fn()
      .mockImplementation(async (id: string) =>
        entry({ id, status: 'PENDING', lockedUntil: null }),
      ),
    findById: jest.fn().mockResolvedValue(entry({ id: ENTRY_1, status: 'LOCKED' })),
    markVetoed: jest
      .fn()
      .mockImplementation(async (id: string) => entry({ id, status: 'VETOED', removedAt: NOW })),
  }) as unknown as jest.Mocked<QueueEntryRepository>;

const makeRedisQueue = (): jest.Mocked<RedisQueueRepository> =>
  ({
    listTopPendingIds: jest.fn().mockResolvedValue([ENTRY_1, ENTRY_2]),
    removeEntry: jest.fn().mockResolvedValue(undefined),
    addLocked: jest.fn().mockResolvedValue(undefined),
    removeLocked: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<RedisQueueRepository>;

const makeScoreRebuild = (): jest.Mocked<ScoreRebuildService> =>
  ({
    rebuildRedisProjection: jest.fn().mockResolvedValue(0),
    recalculateEntry: jest
      .fn()
      .mockImplementation(async (id: string) =>
        entry({ id, status: 'PENDING', score: 5, lockedUntil: null }),
      ),
  }) as unknown as jest.Mocked<ScoreRebuildService>;

const makeRealtime = (): jest.Mocked<RealtimeEventPublisher> =>
  ({
    publishTrackLocked: jest.fn(),
    publishTrackUnlocked: jest.fn(),
    publishQueueUpdated: jest.fn(),
  }) as unknown as jest.Mocked<RealtimeEventPublisher>;

const makeService = () => {
  const sessions = makeSessions();
  const entries = makeEntries();
  const redisQueue = makeRedisQueue();
  const scoreRebuild = makeScoreRebuild();
  const realtime = makeRealtime();
  const service = new LockWindowService(sessions, entries, redisQueue, scoreRebuild, realtime);
  return { service, sessions, entries, redisQueue, scoreRebuild, realtime };
};

describe('LockWindowService.lockTopPending', () => {
  it('locks the top two pending entries using the session lock settings', async () => {
    const { service, entries, redisQueue, realtime } = makeService();

    const result = await service.lockTopPending(SESSION_ID, NOW);

    const lockedUntil = new Date(NOW.getTime() + 90_000);
    expect(result.map((row) => row.id)).toEqual([ENTRY_1, ENTRY_2]);
    expect(entries.lockEntry).toHaveBeenNthCalledWith(1, ENTRY_1, lockedUntil);
    expect(entries.lockEntry).toHaveBeenNthCalledWith(2, ENTRY_2, lockedUntil);
    expect(redisQueue.removeEntry).toHaveBeenCalledWith(SESSION_ID, ENTRY_1);
    expect(redisQueue.removeEntry).toHaveBeenCalledWith(SESSION_ID, ENTRY_2);
    expect(redisQueue.addLocked).toHaveBeenCalledWith(SESSION_ID, ENTRY_1, lockedUntil);
    expect(redisQueue.addLocked).toHaveBeenCalledWith(SESSION_ID, ENTRY_2, lockedUntil);
    expect(realtime.publishTrackLocked).toHaveBeenCalledWith(SESSION_ID, {
      entryId: ENTRY_1,
      status: 'LOCKED',
      lockedUntil: lockedUntil.toISOString(),
      reason: 'window_locked',
    });
  });

  it('does not lock more entries when the lock window is already full', async () => {
    const { service, entries, redisQueue } = makeService();
    (entries.countActiveLocks as jest.Mock).mockResolvedValueOnce(2);

    const result = await service.lockTopPending(SESSION_ID, NOW);

    expect(result).toEqual([]);
    expect(redisQueue.listTopPendingIds).not.toHaveBeenCalled();
    expect(entries.lockEntry).not.toHaveBeenCalled();
  });

  it('rebuilds the pending projection when Redis has no candidates', async () => {
    const { service, redisQueue, scoreRebuild } = makeService();
    (redisQueue.listTopPendingIds as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ENTRY_1]);

    const result = await service.lockTopPending(SESSION_ID, NOW);

    expect(scoreRebuild.rebuildRedisProjection).toHaveBeenCalledWith(SESSION_ID);
    expect(result.map((row) => row.id)).toEqual([ENTRY_1]);
  });
});

describe('LockWindowService.releaseExpiredLocks', () => {
  it('unlocks expired locks and re-adds them to the pending ZSET through scoring', async () => {
    const { service, entries, redisQueue, scoreRebuild, realtime } = makeService();
    (entries.listExpiredLocks as jest.Mock).mockResolvedValueOnce([
      entry({ id: ENTRY_1, status: 'LOCKED', lockedUntil: new Date(NOW.getTime() - 1000) }),
    ]);

    const result = await service.releaseExpiredLocks(SESSION_ID, NOW);

    expect(entries.unlockEntry).toHaveBeenCalledWith(ENTRY_1);
    expect(redisQueue.removeLocked).toHaveBeenCalledWith(SESSION_ID, ENTRY_1);
    expect(scoreRebuild.recalculateEntry).toHaveBeenCalledWith(ENTRY_1);
    expect(realtime.publishTrackUnlocked).toHaveBeenCalledWith(SESSION_ID, {
      entryId: ENTRY_1,
      status: 'PENDING',
      lockedUntil: null,
      reason: 'window_expired',
    });
    expect(result[0]).toEqual(expect.objectContaining({ id: ENTRY_1, status: 'PENDING' }));
  });
});

describe('LockWindowService.processSession', () => {
  it('returns aggregate lock and release counts', async () => {
    const { service, entries } = makeService();
    (entries.listExpiredLocks as jest.Mock).mockResolvedValueOnce([
      entry({ id: ENTRY_3, status: 'LOCKED', lockedUntil: new Date(NOW.getTime() - 1000) }),
    ]);

    const result = await service.processSession(SESSION_ID, NOW);

    expect(result).toEqual({ sessionId: SESSION_ID, locked: 2, released: 1 });
  });
});

describe('LockWindowService.vetoEntry', () => {
  it('lets the host veto a locked entry and clears both Redis projections', async () => {
    const { service, sessions, entries, redisQueue, realtime } = makeService();

    const result = await service.vetoEntry(ENTRY_1, HOST_ID);

    expect(sessions.getSession).toHaveBeenCalledWith(SESSION_ID, HOST_ID);
    expect(entries.markVetoed).toHaveBeenCalledWith(ENTRY_1);
    expect(redisQueue.removeEntry).toHaveBeenCalledWith(SESSION_ID, ENTRY_1);
    expect(redisQueue.removeLocked).toHaveBeenCalledWith(SESSION_ID, ENTRY_1);
    expect(realtime.publishQueueUpdated).toHaveBeenCalledWith(SESSION_ID, {
      reason: 'entry_vetoed',
      entryId: ENTRY_1,
      status: 'VETOED',
    });
    expect(result.entry.status).toBe('VETOED');
  });

  it('rejects veto from a host that does not own the session', async () => {
    const { service, sessions, entries } = makeService();
    (sessions.getSession as jest.Mock).mockRejectedValueOnce(
      new DomainError('FORBIDDEN', 'not yours'),
    );

    await expect(service.vetoEntry(ENTRY_1, HOST_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(entries.markVetoed).not.toHaveBeenCalled();
  });

  it('rejects veto for entries outside the pending/locked window', async () => {
    const { service, entries } = makeService();
    (entries.findById as jest.Mock).mockResolvedValueOnce(
      entry({ id: ENTRY_1, status: 'PLAYING' }),
    );

    await expect(service.vetoEntry(ENTRY_1, HOST_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { status: 'PLAYING' },
    });
    expect(entries.markVetoed).not.toHaveBeenCalled();
  });
});
