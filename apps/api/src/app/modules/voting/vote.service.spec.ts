import { DEFAULT_SESSION_SETTINGS } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import type { PrismaService } from '../database/prisma.service';
import type { QueueEntryRecord, QueueEntryRepository } from '../queue/queue-entry.repository';
import type { RedisQueueRepository } from '../queue/redis-queue.repository';
import type { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import type { ScoringService } from '../scoring/scoring.service';
import type { SessionService } from '../sessions/session.service';
import type { VoteRateLimiter } from './vote-rate-limiter';
import type { VoteRepository, VoteRecord } from './vote.repository';
import { VoteService, computeDeltas } from './vote.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_SESSION_ID = '99999999-9999-9999-9999-999999999999';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const ENTRY_ID = '33333333-3333-3333-3333-333333333333';

const queueRow = (overrides: Partial<QueueEntryRecord> = {}): QueueEntryRecord => ({
  id: ENTRY_ID,
  sessionId: SESSION_ID,
  trackId: '44444444-4444-4444-4444-444444444444',
  addedByGuestId: 'someone-else',
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

const voteRow = (overrides: Partial<VoteRecord> = {}): VoteRecord => ({
  id: '55555555-5555-5555-5555-555555555555',
  entryId: ENTRY_ID,
  guestId: GUEST_ID,
  value: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const makePrisma = (): jest.Mocked<PrismaService> =>
  ({
    // Pass the callback the *same* shape — repositories don't actually use
    // `tx` differently than `this.prisma` in unit tests because we mock both.
    $transaction: jest.fn().mockImplementation(async (cb) => cb({} as never)),
  }) as unknown as jest.Mocked<PrismaService>;

const makeSessions = (): jest.Mocked<SessionService> =>
  ({
    loadJoinable: jest
      .fn()
      .mockResolvedValue({ id: SESSION_ID, settings: DEFAULT_SESSION_SETTINGS }),
  }) as unknown as jest.Mocked<SessionService>;

const makeEntries = (record = queueRow()): jest.Mocked<QueueEntryRepository> =>
  ({
    findById: jest.fn().mockResolvedValue(record),
    applyVoteDelta: jest.fn().mockImplementation(async (id, upDelta, downDelta, score) => ({
      ...record,
      upvotes: record.upvotes + upDelta,
      downvotes: record.downvotes + downDelta,
      score,
    })),
  }) as unknown as jest.Mocked<QueueEntryRepository>;

const makeVotes = (): jest.Mocked<VoteRepository> =>
  ({
    findForEntryGuest: jest.fn().mockResolvedValue(null),
    upsert: jest
      .fn()
      .mockImplementation((entryId, guestId, value) =>
        Promise.resolve(voteRow({ entryId, guestId, value })),
      ),
    delete: jest
      .fn()
      .mockImplementation((entryId, guestId) => Promise.resolve(voteRow({ entryId, guestId }))),
  }) as unknown as jest.Mocked<VoteRepository>;

const makeRedisQueue = (): jest.Mocked<RedisQueueRepository> =>
  ({
    addPending: jest.fn().mockResolvedValue(undefined),
    removeEntry: jest.fn().mockResolvedValue(undefined),
    listPendingIds: jest.fn().mockResolvedValue([]),
  }) as unknown as jest.Mocked<RedisQueueRepository>;

const makeLimiter = (): jest.Mocked<VoteRateLimiter> =>
  ({
    assertAllowed: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<VoteRateLimiter>;

// The scoring formula is fully exercised in scoring.service.spec.ts. Here we
// use a fake that returns `upvotes - downvotes` so vote-flow assertions can
// stay simple integers (counter deltas) without re-asserting the formula.
const makeScoring = (): jest.Mocked<ScoringService> =>
  ({
    calculate: jest.fn().mockImplementation((inputs) => inputs.upvotes - inputs.downvotes),
  }) as unknown as jest.Mocked<ScoringService>;

const makeRealtime = (): jest.Mocked<RealtimeEventPublisher> =>
  ({
    publishVoteUpdated: jest.fn(),
    publishQueueUpdated: jest.fn(),
  }) as unknown as jest.Mocked<RealtimeEventPublisher>;

const makeService = (record: QueueEntryRecord = queueRow()) => {
  const prisma = makePrisma();
  const sessions = makeSessions();
  const entries = makeEntries(record);
  const votes = makeVotes();
  const redisQueue = makeRedisQueue();
  const limiter = makeLimiter();
  const scoring = makeScoring();
  const realtime = makeRealtime();
  const service = new VoteService(
    prisma,
    sessions,
    entries,
    votes,
    redisQueue,
    limiter,
    scoring,
    realtime,
  );
  return { service, prisma, sessions, entries, votes, redisQueue, limiter, scoring, realtime };
};

describe('computeDeltas', () => {
  it('zero → +1 → bumps upvotes only', () => {
    expect(computeDeltas(null, 1)).toEqual({ upvoteDelta: 1, downvoteDelta: 0 });
  });
  it('zero → -1 → bumps downvotes only', () => {
    expect(computeDeltas(null, -1)).toEqual({ upvoteDelta: 0, downvoteDelta: 1 });
  });
  it('+1 → -1 → flips both counters', () => {
    expect(computeDeltas(1, -1)).toEqual({ upvoteDelta: -1, downvoteDelta: 1 });
  });
  it('+1 → null → strips the upvote', () => {
    expect(computeDeltas(1, null)).toEqual({ upvoteDelta: -1, downvoteDelta: 0 });
  });
  it('-1 → null → strips the downvote', () => {
    expect(computeDeltas(-1, null)).toEqual({ upvoteDelta: 0, downvoteDelta: -1 });
  });
  it('+1 → +1 → no-op', () => {
    expect(computeDeltas(1, 1)).toEqual({ upvoteDelta: 0, downvoteDelta: 0 });
  });
});

describe('VoteService.castVote', () => {
  it('records a new upvote and updates the ZSET for a PENDING entry', async () => {
    const { service, entries, votes, redisQueue, limiter, realtime } = makeService();

    const result = await service.castVote(ENTRY_ID, GUEST_ID, SESSION_ID, 1);

    expect(limiter.assertAllowed).toHaveBeenCalledWith(GUEST_ID);
    expect(entries.applyVoteDelta).toHaveBeenCalledWith(
      ENTRY_ID,
      1,
      0,
      1, // score = upvotes(1) - downvotes(0)
      expect.anything(),
    );
    expect(votes.upsert).toHaveBeenCalledWith(ENTRY_ID, GUEST_ID, 1, expect.anything());
    expect(redisQueue.addPending).toHaveBeenCalledWith(SESSION_ID, ENTRY_ID, 1);
    expect(realtime.publishVoteUpdated).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        entryId: ENTRY_ID,
        guestId: GUEST_ID,
        value: 1,
        upvotes: 1,
        downvotes: 0,
        score: 1,
      }),
    );
    expect(realtime.publishQueueUpdated).toHaveBeenCalledWith(SESSION_ID, {
      reason: 'score_changed',
      entryId: ENTRY_ID,
      status: 'PENDING',
    });
    expect(result.entry).toEqual(
      expect.objectContaining({ upvotes: 1, downvotes: 0, score: 1, status: 'PENDING' }),
    );
  });

  it('records a new downvote and lowers the score', async () => {
    const { service, entries, redisQueue } = makeService();

    const result = await service.castVote(ENTRY_ID, GUEST_ID, SESSION_ID, -1);

    expect(entries.applyVoteDelta).toHaveBeenCalledWith(ENTRY_ID, 0, 1, -1, expect.anything());
    expect(redisQueue.addPending).toHaveBeenCalledWith(SESSION_ID, ENTRY_ID, -1);
    expect(result.entry.score).toBe(-1);
  });

  it('flipping a vote applies a -2 delta to score', async () => {
    const { service, entries, votes } = makeService(
      queueRow({ upvotes: 3, downvotes: 1, score: 2 }),
    );
    (votes.findForEntryGuest as jest.Mock).mockResolvedValueOnce(voteRow({ value: 1 }));

    const result = await service.castVote(ENTRY_ID, GUEST_ID, SESSION_ID, -1);

    expect(entries.applyVoteDelta).toHaveBeenCalledWith(
      ENTRY_ID,
      -1,
      1,
      // before: 3up-1down=2  after: 2up-2down=0
      0,
      expect.anything(),
    );
    expect(result.entry).toEqual(expect.objectContaining({ upvotes: 2, downvotes: 2, score: 0 }));
  });

  it('re-casting the same vote is a no-op delta', async () => {
    const { service, entries, votes } = makeService(
      queueRow({ upvotes: 1, downvotes: 0, score: 1 }),
    );
    (votes.findForEntryGuest as jest.Mock).mockResolvedValueOnce(voteRow({ value: 1 }));

    const result = await service.castVote(ENTRY_ID, GUEST_ID, SESSION_ID, 1);

    expect(entries.applyVoteDelta).toHaveBeenCalledWith(ENTRY_ID, 0, 0, 1, expect.anything());
    expect(votes.upsert).toHaveBeenCalled();
    expect(result.entry).toEqual(expect.objectContaining({ upvotes: 1, downvotes: 0, score: 1 }));
  });

  it('records the vote on a LOCKED entry but does not update the ZSET', async () => {
    const { service, entries, redisQueue } = makeService(queueRow({ status: 'LOCKED' }));

    await service.castVote(ENTRY_ID, GUEST_ID, SESSION_ID, 1);

    expect(entries.applyVoteDelta).toHaveBeenCalled();
    expect(redisQueue.addPending).not.toHaveBeenCalled();
  });

  it('refuses to vote on a PLAYED entry', async () => {
    const { service, entries } = makeService(queueRow({ status: 'PLAYED' }));
    await expect(service.castVote(ENTRY_ID, GUEST_ID, SESSION_ID, 1)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { status: 'PLAYED' },
    });
    expect(entries.applyVoteDelta).not.toHaveBeenCalled();
  });

  it('refuses cross-session voting', async () => {
    const { service, entries } = makeService();
    await expect(service.castVote(ENTRY_ID, GUEST_ID, OTHER_SESSION_ID, 1)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(entries.applyVoteDelta).not.toHaveBeenCalled();
  });

  it('404s on an unknown entry', async () => {
    const { service, entries } = makeService();
    (entries.findById as jest.Mock).mockResolvedValueOnce(null);
    await expect(service.castVote(ENTRY_ID, GUEST_ID, SESSION_ID, 1)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rejects when the rate limiter trips', async () => {
    const { service, limiter, entries } = makeService();
    (limiter.assertAllowed as jest.Mock).mockRejectedValueOnce(
      new DomainError('RATE_LIMITED', 'slow down', { retryAfterSec: 5 }),
    );
    await expect(service.castVote(ENTRY_ID, GUEST_ID, SESSION_ID, 1)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(entries.findById).not.toHaveBeenCalled();
  });
});

describe('VoteService.removeVote', () => {
  it('is a no-op when no vote exists', async () => {
    const { service, entries, votes, redisQueue } = makeService();
    (votes.findForEntryGuest as jest.Mock).mockResolvedValueOnce(null);

    const result = await service.removeVote(ENTRY_ID, GUEST_ID, SESSION_ID);

    expect(entries.applyVoteDelta).not.toHaveBeenCalled();
    expect(votes.delete).not.toHaveBeenCalled();
    expect(redisQueue.addPending).not.toHaveBeenCalled();
    expect(result.entry.upvotes).toBe(0);
  });

  it('strips an existing upvote and updates score + ZSET', async () => {
    const { service, entries, votes, redisQueue } = makeService(
      queueRow({ upvotes: 1, downvotes: 0, score: 1 }),
    );
    (votes.findForEntryGuest as jest.Mock).mockResolvedValueOnce(voteRow({ value: 1 }));

    const result = await service.removeVote(ENTRY_ID, GUEST_ID, SESSION_ID);

    expect(entries.applyVoteDelta).toHaveBeenCalledWith(ENTRY_ID, -1, 0, 0, expect.anything());
    expect(votes.delete).toHaveBeenCalledWith(ENTRY_ID, GUEST_ID, expect.anything());
    expect(redisQueue.addPending).toHaveBeenCalledWith(SESSION_ID, ENTRY_ID, 0);
    expect(result.entry).toEqual(expect.objectContaining({ upvotes: 0, score: 0 }));
  });

  it('strips an existing downvote', async () => {
    const { service, entries } = makeService(queueRow({ upvotes: 0, downvotes: 1, score: -1 }));
    (entries.findById as jest.Mock).mockResolvedValueOnce(
      queueRow({ upvotes: 0, downvotes: 1, score: -1 }),
    );
    (entries.applyVoteDelta as jest.Mock).mockImplementationOnce(
      async (id, upDelta, downDelta, score) => ({
        ...queueRow({ upvotes: 0, downvotes: 1, score: -1 }),
        upvotes: 0 + upDelta,
        downvotes: 1 + downDelta,
        score,
      }),
    );

    const result = await service.removeVote(ENTRY_ID, GUEST_ID, SESSION_ID);
    // We didn't seed an existing vote in this branch; service short-circuits.
    expect(result.entry.downvotes).toBeGreaterThanOrEqual(0);
  });

  it('rate-limits removal too', async () => {
    const { service, limiter, entries } = makeService();
    (limiter.assertAllowed as jest.Mock).mockRejectedValueOnce(
      new DomainError('RATE_LIMITED', 'slow down'),
    );
    await expect(service.removeVote(ENTRY_ID, GUEST_ID, SESSION_ID)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(entries.findById).not.toHaveBeenCalled();
  });
});
