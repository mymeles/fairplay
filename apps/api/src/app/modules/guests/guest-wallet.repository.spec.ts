import type { PrismaService } from '../database/prisma.service';
import { GuestWalletRepository } from './guest-wallet.repository';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const NOW = new Date('2026-01-01T00:00:00.000Z');

const walletRow = {
  id: '33333333-3333-3333-3333-333333333333',
  sessionId: SESSION_ID,
  guestId: GUEST_ID,
  boostTokens: 3,
  challengeTokens: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

const makePrisma = (): jest.Mocked<PrismaService> => {
  const prisma = {
    guestWallet: {
      create: jest.fn().mockResolvedValue(walletRow),
      findUnique: jest.fn().mockResolvedValue(walletRow),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    tokenLedger: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
  const prismaLike = {
    guestWallet: prisma.guestWallet,
    tokenLedger: prisma.tokenLedger,
  };
  return {
    ...prisma,
    $transaction: jest.fn().mockImplementation(async (cb) => cb(prismaLike)),
  } as unknown as jest.Mocked<PrismaService>;
};

describe('GuestWalletRepository', () => {
  it('creates join-grant ledger rows with the initial wallet', async () => {
    const prisma = makePrisma();
    const repo = new GuestWalletRepository(prisma);

    const result = await repo.create({
      sessionId: SESSION_ID,
      guestId: GUEST_ID,
      boostTokens: 3,
      challengeTokens: 1,
    });

    expect(prisma.guestWallet.create).toHaveBeenCalledWith({
      data: {
        sessionId: SESSION_ID,
        guestId: GUEST_ID,
        boostTokens: 3,
        challengeTokens: 1,
      },
    });
    expect(prisma.tokenLedger.createMany).toHaveBeenCalledWith({
      data: [
        {
          sessionId: SESSION_ID,
          guestId: GUEST_ID,
          tokenType: 'BOOST',
          amount: 3,
          reason: 'JOIN_GRANT',
        },
        {
          sessionId: SESSION_ID,
          guestId: GUEST_ID,
          tokenType: 'CHALLENGE',
          amount: 1,
          reason: 'JOIN_GRANT',
        },
      ],
    });
    expect(result.boostTokens).toBe(3);
  });

  it('does not write zero-token ledger rows', async () => {
    const prisma = makePrisma();
    const repo = new GuestWalletRepository(prisma);

    await repo.create({
      sessionId: SESSION_ID,
      guestId: GUEST_ID,
      boostTokens: 0,
      challengeTokens: 0,
    });

    expect(prisma.tokenLedger.createMany).not.toHaveBeenCalled();
  });

  it('spends boost tokens atomically with updateMany guard', async () => {
    const prisma = makePrisma();
    const repo = new GuestWalletRepository(prisma);

    const result = await repo.spendBoostToken(GUEST_ID, SESSION_ID);

    expect(prisma.guestWallet.updateMany).toHaveBeenCalledWith({
      where: { guestId: GUEST_ID, sessionId: SESSION_ID, boostTokens: { gt: 0 } },
      data: { boostTokens: { decrement: 1 } },
    });
    expect(result?.guestId).toBe(GUEST_ID);
  });
});
