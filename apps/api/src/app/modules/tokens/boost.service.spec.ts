import { DEFAULT_SESSION_SETTINGS } from '@fairplay/shared-types';
import type { PrismaService } from '../database/prisma.service';
import type { GuestWalletRecord, GuestWalletRepository } from '../guests/guest-wallet.repository';
import type { ModerationService } from '../moderation/moderation.service';
import type { QueueEntryRecord, QueueEntryRepository } from '../queue/queue-entry.repository';
import type { RedisQueueRepository } from '../queue/redis-queue.repository';
import type { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import { ScoringService } from '../scoring/scoring.service';
import type { SessionService } from '../sessions/session.service';
import { BoostService } from './boost.service';
import type { TokenLedgerService } from './token-ledger.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_SESSION_ID = '99999999-9999-9999-9999-999999999999';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const ENTRY_ID = '33333333-3333-3333-3333-333333333333';
const NOW = new Date();

const entry = (overrides: Partial<QueueEntryRecord> = {}): QueueEntryRecord => ({
  id: ENTRY_ID,
  sessionId: SESSION_ID,
  trackId: '44444444-4444-4444-4444-444444444444',
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
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const wallet = (overrides: Partial<GuestWalletRecord> = {}): GuestWalletRecord => ({
  guestId: GUEST_ID,
  sessionId: SESSION_ID,
  boostTokens: 2,
  challengeTokens: 1,
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
    incrementBoostCredits: jest
      .fn()
      .mockImplementation(async (id: string) => entry({ id, boostCredits: 1 })),
    setScore: jest
      .fn()
      .mockImplementation(async (id: string, score: number) =>
        entry({ id, boostCredits: 1, score }),
      ),
  }) as unknown as jest.Mocked<QueueEntryRepository>;

const makeWallets = (): jest.Mocked<GuestWalletRepository> =>
  ({
    findByGuestId: jest.fn().mockResolvedValue(wallet({ boostTokens: 1 })),
    spendBoostToken: jest.fn().mockResolvedValue(wallet({ boostTokens: 1 })),
  }) as unknown as jest.Mocked<GuestWalletRepository>;

const makeRedisQueue = (): jest.Mocked<RedisQueueRepository> =>
  ({
    addPending: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<RedisQueueRepository>;

const makeLedger = (): jest.Mocked<TokenLedgerService> =>
  ({
    findEntrySpend: jest.fn().mockResolvedValue(null),
    record: jest.fn().mockResolvedValue({
      id: '55555555-5555-5555-5555-555555555555',
      sessionId: SESSION_ID,
      guestId: GUEST_ID,
      entryId: ENTRY_ID,
      tokenType: 'BOOST',
      amount: -1,
      reason: 'BOOST_SPEND',
      createdAt: NOW,
    }),
  }) as unknown as jest.Mocked<TokenLedgerService>;

const makeRealtime = (): jest.Mocked<RealtimeEventPublisher> =>
  ({
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
  const ledger = makeLedger();
  const moderation = makeModeration();
  const realtime = makeRealtime();
  const service = new BoostService(
    prisma,
    sessions,
    entries,
    wallets,
    redisQueue,
    new ScoringService(),
    ledger,
    moderation,
    realtime,
  );
  return { service, prisma, sessions, entries, wallets, redisQueue, ledger, moderation, realtime };
};

describe('BoostService.applyBoost', () => {
  it('spends one boost token, increments boost credits, recalculates, and publishes', async () => {
    const { service, wallets, entries, redisQueue, ledger, moderation, realtime } = makeService();

    const result = await service.applyBoost(ENTRY_ID, GUEST_ID, SESSION_ID);

    expect(moderation.assertGuestCanMutateQueue).toHaveBeenCalledWith(
      SESSION_ID,
      GUEST_ID,
      'boost',
    );
    expect(ledger.findEntrySpend).toHaveBeenCalledWith(
      ENTRY_ID,
      GUEST_ID,
      'BOOST',
      'BOOST_SPEND',
    );
    expect(wallets.spendBoostToken).toHaveBeenCalledWith(
      GUEST_ID,
      SESSION_ID,
      expect.anything(),
    );
    expect(ledger.record).toHaveBeenCalledWith(
      {
        sessionId: SESSION_ID,
        guestId: GUEST_ID,
        entryId: ENTRY_ID,
        tokenType: 'BOOST',
        amount: -1,
        reason: 'BOOST_SPEND',
      },
      expect.anything(),
    );
    expect(entries.incrementBoostCredits).toHaveBeenCalledWith(ENTRY_ID, expect.anything());
    expect(entries.setScore).toHaveBeenCalledWith(ENTRY_ID, expect.any(Number), expect.anything());
    expect(redisQueue.addPending).toHaveBeenCalledWith(
      SESSION_ID,
      ENTRY_ID,
      expect.any(Number),
    );
    expect(realtime.publishQueueUpdated).toHaveBeenCalledWith(SESSION_ID, {
      reason: 'boost_applied',
      entryId: ENTRY_ID,
      status: 'PENDING',
    });
    expect(realtime.publishTokenUpdated).toHaveBeenCalledWith(
      SESSION_ID,
      GUEST_ID,
      expect.objectContaining({
        tokenType: 'BOOST',
        boostTokens: 1,
        reason: 'boost_applied',
      }),
    );
    expect(result.entry.boostCredits).toBe(1);
    expect(result.wallet.boostTokens).toBe(1);
    expect(result.idempotent).toBe(false);
  });

  it('does not spend twice when the boost ledger row already exists', async () => {
    const { service, wallets, entries, redisQueue, ledger, realtime } = makeService(
      entry({ boostCredits: 1, score: 3 }),
    );
    (ledger.findEntrySpend as jest.Mock).mockResolvedValueOnce({
      id: '55555555-5555-5555-5555-555555555555',
      sessionId: SESSION_ID,
      guestId: GUEST_ID,
      entryId: ENTRY_ID,
      tokenType: 'BOOST',
      amount: -1,
      reason: 'BOOST_SPEND',
      createdAt: NOW,
    });

    const result = await service.applyBoost(ENTRY_ID, GUEST_ID, SESSION_ID);

    expect(wallets.spendBoostToken).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
    expect(entries.incrementBoostCredits).not.toHaveBeenCalled();
    expect(redisQueue.addPending).not.toHaveBeenCalled();
    expect(realtime.publishTokenUpdated).not.toHaveBeenCalled();
    expect(result.idempotent).toBe(true);
    expect(result.entry.boostCredits).toBe(1);
  });

  it('fails without a boost token and does not touch the entry or ledger', async () => {
    const { service, wallets, entries, ledger, redisQueue } = makeService();
    (wallets.spendBoostToken as jest.Mock).mockResolvedValueOnce(null);

    await expect(service.applyBoost(ENTRY_ID, GUEST_ID, SESSION_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { tokenType: 'BOOST' },
    });

    expect(ledger.record).not.toHaveBeenCalled();
    expect(entries.incrementBoostCredits).not.toHaveBeenCalled();
    expect(redisQueue.addPending).not.toHaveBeenCalled();
  });

  it('rejects entries outside the guest token session', async () => {
    const { service, prisma } = makeService();

    await expect(service.applyBoost(ENTRY_ID, GUEST_ID, OTHER_SESSION_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects entries that are already past the internal queue', async () => {
    const { service, prisma } = makeService(entry({ status: 'QUEUED_TO_SPOTIFY' }));

    await expect(service.applyBoost(ENTRY_ID, GUEST_ID, SESSION_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { status: 'QUEUED_TO_SPOTIFY' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
