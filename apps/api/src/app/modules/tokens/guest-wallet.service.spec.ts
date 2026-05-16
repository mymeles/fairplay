import type { PrismaService } from '../database/prisma.service';
import type { GuestRepository, SessionGuestRecord } from '../guests/guest.repository';
import type { GuestWalletRecord, GuestWalletRepository } from '../guests/guest-wallet.repository';
import type { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import type { SessionService } from '../sessions/session.service';
import { GuestWalletService } from './guest-wallet.service';
import type { TokenLedgerService } from './token-ledger.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_SESSION_ID = '99999999-9999-9999-9999-999999999999';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const HOST_ID = '33333333-3333-3333-3333-333333333333';
const NOW = new Date('2026-01-01T00:00:00.000Z');

const wallet = (overrides: Partial<GuestWalletRecord> = {}): GuestWalletRecord => ({
  guestId: GUEST_ID,
  sessionId: SESSION_ID,
  boostTokens: 3,
  challengeTokens: 1,
  ...overrides,
});

const guest = (overrides: Partial<SessionGuestRecord> = {}): SessionGuestRecord => ({
  id: GUEST_ID,
  sessionId: SESSION_ID,
  displayName: 'Alice',
  deviceHash: null,
  role: 'GUEST',
  status: 'ACTIVE',
  joinedAt: NOW,
  lastSeenAt: null,
  ...overrides,
});

const makePrisma = (): jest.Mocked<PrismaService> =>
  ({
    $transaction: jest.fn().mockImplementation(async (cb) => cb({} as never)),
  }) as unknown as jest.Mocked<PrismaService>;

const makeSessions = (): jest.Mocked<SessionService> =>
  ({
    getSession: jest.fn().mockResolvedValue({ id: SESSION_ID, hostUserId: HOST_ID }),
  }) as unknown as jest.Mocked<SessionService>;

const makeGuests = (): jest.Mocked<GuestRepository> =>
  ({
    findById: jest.fn().mockResolvedValue(guest()),
  }) as unknown as jest.Mocked<GuestRepository>;

const makeWallets = (): jest.Mocked<GuestWalletRepository> =>
  ({
    findByGuestId: jest.fn().mockResolvedValue(wallet()),
    grantTokens: jest
      .fn()
      .mockResolvedValue(wallet({ boostTokens: 5, challengeTokens: 2 })),
  }) as unknown as jest.Mocked<GuestWalletRepository>;

const makeLedger = (): jest.Mocked<TokenLedgerService> =>
  ({
    record: jest.fn().mockResolvedValue({
      id: '44444444-4444-4444-4444-444444444444',
      sessionId: SESSION_ID,
      guestId: GUEST_ID,
      entryId: null,
      tokenType: 'BOOST',
      amount: 2,
      reason: 'HOST_GRANT',
      createdAt: NOW,
    }),
  }) as unknown as jest.Mocked<TokenLedgerService>;

const makeRealtime = (): jest.Mocked<RealtimeEventPublisher> =>
  ({
    publishTokenUpdated: jest.fn(),
  }) as unknown as jest.Mocked<RealtimeEventPublisher>;

const makeService = () => {
  const prisma = makePrisma();
  const sessions = makeSessions();
  const guests = makeGuests();
  const wallets = makeWallets();
  const ledger = makeLedger();
  const realtime = makeRealtime();
  const service = new GuestWalletService(
    prisma,
    sessions,
    guests,
    wallets,
    ledger,
    realtime,
  );
  return { service, prisma, sessions, guests, wallets, ledger, realtime };
};

describe('GuestWalletService.getWallet', () => {
  it('returns the authenticated guest wallet', async () => {
    const { service, wallets } = makeService();

    const result = await service.getWallet(GUEST_ID, SESSION_ID);

    expect(wallets.findByGuestId).toHaveBeenCalledWith(GUEST_ID);
    expect(result).toEqual(wallet());
  });

  it('forbids reading a wallet outside the guest token session', async () => {
    const { service } = makeService();

    await expect(service.getWallet(GUEST_ID, OTHER_SESSION_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('GuestWalletService.grantTokens', () => {
  it('verifies host ownership, increments wallet, records ledger rows, and publishes', async () => {
    const { service, sessions, guests, wallets, ledger, realtime } = makeService();

    const result = await service.grantTokens(SESSION_ID, GUEST_ID, HOST_ID, {
      boostTokens: 2,
      challengeTokens: 1,
    });

    expect(sessions.getSession).toHaveBeenCalledWith(SESSION_ID, HOST_ID);
    expect(guests.findById).toHaveBeenCalledWith(GUEST_ID);
    expect(wallets.grantTokens).toHaveBeenCalledWith(
      GUEST_ID,
      SESSION_ID,
      { boostTokens: 2, challengeTokens: 1 },
      expect.anything(),
    );
    expect(ledger.record).toHaveBeenCalledWith(
      {
        sessionId: SESSION_ID,
        guestId: GUEST_ID,
        tokenType: 'BOOST',
        amount: 2,
        reason: 'HOST_GRANT',
      },
      expect.anything(),
    );
    expect(ledger.record).toHaveBeenCalledWith(
      {
        sessionId: SESSION_ID,
        guestId: GUEST_ID,
        tokenType: 'CHALLENGE',
        amount: 1,
        reason: 'HOST_GRANT',
      },
      expect.anything(),
    );
    expect(realtime.publishTokenUpdated).toHaveBeenCalledWith(
      SESSION_ID,
      GUEST_ID,
      expect.objectContaining({
        tokenType: 'WALLET',
        boostTokens: 5,
        challengeTokens: 2,
        reason: 'host_grant',
      }),
    );
    expect(result.wallet.boostTokens).toBe(5);
  });

  it('rejects empty grants before opening a transaction', async () => {
    const { service, prisma, wallets, ledger } = makeService();

    await expect(
      service.grantTokens(SESSION_ID, GUEST_ID, HOST_ID, {
        boostTokens: 0,
        challengeTokens: 0,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(wallets.grantTokens).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it('rejects guests outside the host session', async () => {
    const { service, guests, wallets, ledger } = makeService();
    (guests.findById as jest.Mock).mockResolvedValueOnce(guest({ sessionId: OTHER_SESSION_ID }));

    await expect(
      service.grantTokens(SESSION_ID, GUEST_ID, HOST_ID, { boostTokens: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(wallets.grantTokens).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
  });
});
