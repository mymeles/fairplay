import { DEFAULT_SESSION_SETTINGS } from '@fairplay/shared-types';
import type {
  QueueEntryRecord,
  QueueEntryRepository,
} from '../queue/queue-entry.repository';
import type { RedisQueueRepository } from '../queue/redis-queue.repository';
import type { PartySessionRecord } from '../sessions/session.repository';
import type { SessionService } from '../sessions/session.service';
import { ScoreRebuildService } from './score-rebuild.service';
import { ScoringService } from './scoring.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
// Fresh timestamps so the rebuild service's `new Date()` lines up with the
// fixture and aging contribution stays ~0. Anything frozen in the past would
// inflate scores by `0.05 * minutesWaiting`.
const NOW = new Date();

const entry = (overrides: Partial<QueueEntryRecord>): QueueEntryRecord => ({
  id: 'entry-1',
  sessionId: SESSION_ID,
  trackId: 'track-1',
  addedByGuestId: 'g1',
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

const sessionRecord: PartySessionRecord = {
  id: SESSION_ID,
  hostUserId: 'host-1',
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
  createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + 3600_000),
  endedAt: null,
};

const makeSessions = (): jest.Mocked<SessionService> =>
  ({
    loadJoinable: jest.fn().mockResolvedValue(sessionRecord),
  }) as unknown as jest.Mocked<SessionService>;

const makeEntries = (entries: QueueEntryRecord[]): jest.Mocked<QueueEntryRepository> =>
  ({
    findById: jest.fn().mockImplementation((id: string) =>
      Promise.resolve(entries.find((e) => e.id === id) ?? null),
    ),
    listActiveBySession: jest.fn().mockResolvedValue(entries),
    setScore: jest.fn().mockImplementation((id, score) => {
      const found = entries.find((e) => e.id === id);
      if (!found) throw new Error(`entry ${id} not found in fixture`);
      found.score = score;
      return Promise.resolve({ ...found });
    }),
  }) as unknown as jest.Mocked<QueueEntryRepository>;

const makeRedisQueue = (): jest.Mocked<RedisQueueRepository> =>
  ({
    addPending: jest.fn().mockResolvedValue(undefined),
    deletePending: jest.fn().mockResolvedValue(undefined),
    setPendingBulk: jest.fn().mockResolvedValue(undefined),
    removeEntry: jest.fn().mockResolvedValue(undefined),
    listPendingIds: jest.fn().mockResolvedValue([]),
  }) as unknown as jest.Mocked<RedisQueueRepository>;

const makeService = (entries: QueueEntryRecord[]) => {
  const sessions = makeSessions();
  const entryRepo = makeEntries(entries);
  const redisQueue = makeRedisQueue();
  const scoring = new ScoringService();
  const service = new ScoreRebuildService(sessions, entryRepo, redisQueue, scoring);
  return { service, sessions, entryRepo, redisQueue, scoring };
};

describe('ScoreRebuildService.recalculateEntry', () => {
  it('recomputes the score and pushes to ZSET when PENDING', async () => {
    const e = entry({ id: 'e1', upvotes: 2 });
    const { service, entryRepo, redisQueue } = makeService([e]);
    const updated = await service.recalculateEntry('e1');
    // 2 * log(3) ≈ 2.1972 plus a microsecond-level aging contribution since
    // the service captures its own `now`. Allow a few μ of slack.
    expect(updated.score).toBeCloseTo(2 * Math.log(3), 2);
    expect(entryRepo.setScore).toHaveBeenCalledWith('e1', expect.any(Number));
    expect(redisQueue.addPending).toHaveBeenCalledWith(SESSION_ID, 'e1', updated.score);
  });

  it('does not ZADD a LOCKED entry', async () => {
    const e = entry({ id: 'e1', status: 'LOCKED' });
    const { service, redisQueue, entryRepo } = makeService([e]);
    await service.recalculateEntry('e1');
    expect(entryRepo.setScore).toHaveBeenCalled();
    expect(redisQueue.addPending).not.toHaveBeenCalled();
  });

  it('does not ZADD a challenged entry during its relock hold', async () => {
    const e = entry({
      id: 'e1',
      status: 'PENDING',
      lockedUntil: new Date(Date.now() + 30_000),
    });
    const { service, redisQueue } = makeService([e]);
    await service.recalculateEntry('e1');
    expect(redisQueue.addPending).not.toHaveBeenCalled();
    expect(redisQueue.removeEntry).toHaveBeenCalledWith(SESSION_ID, 'e1');
  });

  it('404s on an unknown entry', async () => {
    const { service } = makeService([]);
    await expect(service.recalculateEntry('does-not-exist')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('ScoreRebuildService.recalculateSession + rebuildRedisProjection', () => {
  it('produces Redis order that matches recomputed scores (highest first)', async () => {
    const e1 = entry({ id: 'a', upvotes: 5 });   // big upvotes
    const e2 = entry({ id: 'b', upvotes: 1 });   // medium
    const e3 = entry({ id: 'c', downvotes: 2 }); // negative
    const { service, redisQueue } = makeService([e1, e2, e3]);

    const result = await service.recalculateSession(SESSION_ID);

    expect(result.recalculated).toBe(3);
    expect(redisQueue.deletePending).toHaveBeenCalledWith(SESSION_ID);
    expect(redisQueue.setPendingBulk).toHaveBeenCalledWith(
      SESSION_ID,
      expect.any(Array),
    );

    const bulkArgs = (redisQueue.setPendingBulk as jest.Mock).mock.calls[0][1] as {
      entryId: string;
      score: number;
    }[];
    // listActiveBySession returns score-desc, so a/b/c order is preserved.
    expect(bulkArgs.map((x) => x.entryId)).toEqual(['a', 'b', 'c']);
    // Scores strictly decreasing
    const [first, second, third] = bulkArgs;
    expect(first!.score).toBeGreaterThan(second!.score);
    expect(second!.score).toBeGreaterThan(third!.score);
  });

  it('only PENDING entries land in the ZSET projection', async () => {
    const e1 = entry({ id: 'p', status: 'PENDING', upvotes: 3 });
    const e2 = entry({ id: 'l', status: 'LOCKED', upvotes: 99 });
    const e3 = entry({
      id: 'held',
      status: 'PENDING',
      upvotes: 99,
      lockedUntil: new Date(Date.now() + 30_000),
    });
    const { service, redisQueue } = makeService([e1, e2, e3]);

    const result = await service.recalculateSession(SESSION_ID);

    expect(result.pendingInZset).toBe(1);
    const bulkArgs = (redisQueue.setPendingBulk as jest.Mock).mock.calls[0][1] as {
      entryId: string;
    }[];
    expect(bulkArgs.map((x) => x.entryId)).toEqual(['p']);
  });

  it('skips setScore when the recomputed score is unchanged', async () => {
    const now = new Date();
    const e = entry({ id: 'unchanged', upvotes: 0, score: 0, createdAt: now, updatedAt: now });
    const { service, entryRepo } = makeService([e]);
    await service.recalculateSession(SESSION_ID);
    expect(entryRepo.setScore).not.toHaveBeenCalled();
  });

  it('rebuildRedisProjection is a no-op for an empty session (still DELs)', async () => {
    const { service, redisQueue } = makeService([]);
    const count = await service.rebuildRedisProjection(SESSION_ID);
    expect(count).toBe(0);
    expect(redisQueue.deletePending).toHaveBeenCalledWith(SESSION_ID);
    expect(redisQueue.setPendingBulk).toHaveBeenCalledWith(SESSION_ID, []);
  });
});
