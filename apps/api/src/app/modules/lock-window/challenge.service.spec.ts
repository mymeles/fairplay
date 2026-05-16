import { DEFAULT_SESSION_SETTINGS } from '@fairplay/shared-types';
import type { PrismaService } from '../database/prisma.service';
import type { GuestWalletRecord, GuestWalletRepository } from '../guests/guest-wallet.repository';
import type { ModerationService } from '../moderation/moderation.service';
import type { QueueEntryRecord, QueueEntryRepository } from '../queue/queue-entry.repository';
import type { RedisQueueRepository } from '../queue/redis-queue.repository';
import type { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import type { ScoreRebuildService } from '../scoring/score-rebuild.service';
import type { SessionService } from '../sessions/session.service';
import type { TokenLedgerService } from '../tokens/token-ledger.service';
import { ChallengeService } from './challenge.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_SESSION_ID = '99999999-9999-9999-9999-999999999999';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const ENTRY_ID = '33333333-3333-3333-3333-333333333333';
const NOW = new Date('2026-01-01T00:00:00.000Z');

const entry = (overrides: Partial<QueueEntryRecord> = {}): QueueEntryRecord => ({
  id: ENTRY_ID,
  sessionId: SESSION_ID,
  trackId: '44444444-4444-4444-4444-444444444444',
  addedByGuestId: GUEST_ID,
  status: 'LOCKED',
  upvotes: 2,
  downvotes: 0,
  boostCredits: 0,
  score: 4,
  lockedUntil: new Date(NOW.getTime() + 90_000),
  hostPinned: false,
  spotifyQueuedAt: null,
  playingAt: null,
  playedAt: null,
  removedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const wallet = (overrides: Partial<GuestWalletRecord> = {}): GuestWalletRecord => ({
  guestId: GUEST_ID,
  sessionId: SESSION_ID,
  boostTokens: 3,
  challengeTokens: 0,
  ...overrides,
});

const makePrisma = (): jest.Mocked<PrismaService> =>
  ({
    $transaction: jest.fn().mockImplementation(async (cb) => cb({} as never)),
  }) as unknown as jest.Mocked<PrismaService>;

const makeSessions = (): jest.Mocked<SessionService> =>
  ({
    loadJoinable: jest
      .fn()
      .mockResolvedValue({ id: SESSION_ID, settings: DEFAULT_SESSION_SETTINGS }),
  }) as unknown as jest.Mocked<SessionService>;

const makeEntries = (record = entry()): jest.Mocked<QueueEntryRepository> =>
  ({
    findById: jest.fn().mockResolvedValue(record),
    findByIdForUpdate: jest.fn().mockResolvedValue(record),
    unlockEntry: jest
      .fn()
      .mockImplementation(async (id: string) =>
        entry({ id, status: 'PENDING', lockedUntil: null }),
      ),
  }) as unknown as jest.Mocked<QueueEntryRepository>;

const makeWallets = (): jest.Mocked<GuestWalletRepository> =>
  ({
    spendChallengeToken: jest.fn().mockResolvedValue(wallet()),
  }) as unknown as jest.Mocked<GuestWalletRepository>;

const makeRedisQueue = (): jest.Mocked<RedisQueueRepository> =>
  ({
    removeLocked: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<RedisQueueRepository>;

const makeScoreRebuild = (): jest.Mocked<ScoreRebuildService> =>
  ({
    recalculateEntry: jest
      .fn()
      .mockImplementation(async (id: string) =>
        entry({ id, status: 'PENDING', lockedUntil: null, score: 5 }),
      ),
  }) as unknown as jest.Mocked<ScoreRebuildService>;

const makeLedger = (): jest.Mocked<TokenLedgerService> =>
  ({
    record: jest.fn().mockResolvedValue({
      id: '55555555-5555-5555-5555-555555555555',
      sessionId: SESSION_ID,
      guestId: GUEST_ID,
      entryId: ENTRY_ID,
      tokenType: 'CHALLENGE',
      amount: -1,
      reason: 'CHALLENGE_LOCK',
      createdAt: NOW,
    }),
  }) as unknown as jest.Mocked<TokenLedgerService>;

const makeRealtime = (): jest.Mocked<RealtimeEventPublisher> =>
  ({
    publishTrackUnlocked: jest.fn(),
    publishQueueUpdated: jest.fn(),
    publishTokenUpdated: jest.fn(),
  }) as unknown as jest.Mocked<RealtimeEventPublisher>;

const makeModeration = (): jest.Mocked<ModerationService> =>
  ({
    assertGuestCanMutateQueue: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<ModerationService>;

const makeService = (record = entry()) => {
  const prisma = makePrisma();
  const sessions = makeSessions();
  const entries = makeEntries(record);
  const wallets = makeWallets();
  const redisQueue = makeRedisQueue();
  const scoreRebuild = makeScoreRebuild();
  const ledger = makeLedger();
  const moderation = makeModeration();
  const realtime = makeRealtime();
  const service = new ChallengeService(
    prisma,
    sessions,
    entries,
    wallets,
    redisQueue,
    scoreRebuild,
    ledger,
    moderation,
    realtime,
  );
  return { service, prisma, sessions, entries, wallets, redisQueue, scoreRebuild, ledger, moderation, realtime };
};

describe('ChallengeService.challengeLock', () => {
  it('spends one challenge token, unlocks the entry, and recalculates rank', async () => {
    const { service, entries, wallets, redisQueue, scoreRebuild, ledger, moderation, realtime } = makeService();

    const result = await service.challengeLock(ENTRY_ID, GUEST_ID, SESSION_ID);

    expect(moderation.assertGuestCanMutateQueue).toHaveBeenCalledWith(
      SESSION_ID,
      GUEST_ID,
      'challenge',
    );
    expect(wallets.spendChallengeToken).toHaveBeenCalledWith(
      GUEST_ID,
      SESSION_ID,
      expect.anything(),
    );
    expect(entries.unlockEntry).toHaveBeenCalledWith(ENTRY_ID, expect.anything());
    expect(ledger.record).toHaveBeenCalledWith(
      {
        sessionId: SESSION_ID,
        guestId: GUEST_ID,
        entryId: ENTRY_ID,
        tokenType: 'CHALLENGE',
        amount: -1,
        reason: 'CHALLENGE_LOCK',
      },
      expect.anything(),
    );
    expect(redisQueue.removeLocked).toHaveBeenCalledWith(SESSION_ID, ENTRY_ID);
    expect(scoreRebuild.recalculateEntry).toHaveBeenCalledWith(ENTRY_ID);
    expect(realtime.publishTrackUnlocked).toHaveBeenCalledWith(SESSION_ID, {
      entryId: ENTRY_ID,
      status: 'PENDING',
      lockedUntil: null,
      reason: 'challenge',
    });
    expect(realtime.publishTokenUpdated).toHaveBeenCalledWith(
      SESSION_ID,
      GUEST_ID,
      expect.objectContaining({
        guestId: GUEST_ID,
        tokenType: 'CHALLENGE',
        challengeTokens: 0,
      }),
    );
    expect(result.entry).toEqual(
      expect.objectContaining({ id: ENTRY_ID, status: 'PENDING', lockedUntil: null }),
    );
    expect(result.wallet.challengeTokens).toBe(0);
  });

  it('fails without a challenge token and leaves the lock intact', async () => {
    const { service, entries, wallets, redisQueue, scoreRebuild, ledger } = makeService();
    (wallets.spendChallengeToken as jest.Mock).mockResolvedValueOnce(null);

    await expect(service.challengeLock(ENTRY_ID, GUEST_ID, SESSION_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    expect(ledger.record).not.toHaveBeenCalled();
    expect(entries.unlockEntry).not.toHaveBeenCalled();
    expect(redisQueue.removeLocked).not.toHaveBeenCalled();
    expect(scoreRebuild.recalculateEntry).not.toHaveBeenCalled();
  });

  it('rejects entries that are not locked', async () => {
    const { service, prisma, entries } = makeService(
      entry({ status: 'PENDING', lockedUntil: null }),
    );

    await expect(service.challengeLock(ENTRY_ID, GUEST_ID, SESSION_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { status: 'PENDING' },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(entries.unlockEntry).not.toHaveBeenCalled();
  });

  it('forbids a guest token scoped to another session', async () => {
    const { service, entries } = makeService();

    await expect(service.challengeLock(ENTRY_ID, GUEST_ID, OTHER_SESSION_ID)).rejects.toMatchObject(
      { code: 'FORBIDDEN' },
    );

    expect(entries.unlockEntry).not.toHaveBeenCalled();
  });
});
