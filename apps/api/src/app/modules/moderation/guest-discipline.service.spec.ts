import type { PrismaService } from '../database/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { RedisQueueRepository } from '../queue/redis-queue.repository';
import { GuestDisciplineService } from './guest-discipline.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const HOST_ID = '22222222-2222-2222-2222-222222222222';
const GUEST_ID = '33333333-3333-3333-3333-333333333333';

const guestRow = (status = 'ACTIVE') => ({
  id: GUEST_ID,
  sessionId: SESSION_ID,
  displayName: 'Guest',
  deviceHash: 'device-1',
  role: 'GUEST',
  status,
  joinedAt: new Date('2026-01-01T00:00:00Z'),
  lastSeenAt: null,
});

const makePrisma = (): jest.Mocked<PrismaService> => {
  const tx = {
    sessionGuest: {
      update: jest.fn().mockResolvedValue(guestRow('MUTED')),
    },
    queueEntry: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
  return {
    partySession: {
      findUnique: jest.fn().mockResolvedValue({ hostUserId: HOST_ID }),
    },
    sessionGuest: {
      findUnique: jest.fn().mockResolvedValue(guestRow()),
      update: jest.fn().mockResolvedValue(guestRow('ACTIVE')),
    },
    queueEntry: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: '44444444-4444-4444-4444-444444444444' }]),
    },
    $transaction: jest.fn().mockImplementation(async (cb) => cb(tx)),
  } as unknown as jest.Mocked<PrismaService>;
};

const makeRedis = () => {
  const client = { zrem: jest.fn().mockResolvedValue(1) };
  const redis = {
    getClient: jest.fn().mockReturnValue(client),
  } as unknown as jest.Mocked<RedisService>;
  return { redis, client };
};

describe('GuestDisciplineService', () => {
  it('mutes a guest, removes pending/locked entries, and cleans Redis', async () => {
    const prisma = makePrisma();
    const { redis, client } = makeRedis();
    const service = new GuestDisciplineService(prisma, redis);

    const result = await service.muteGuest(SESSION_ID, GUEST_ID, HOST_ID);

    expect(prisma.queueEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sessionId: SESSION_ID,
          addedByGuestId: GUEST_ID,
          status: { in: ['PENDING', 'LOCKED'] },
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(client.zrem).toHaveBeenCalledWith(
      RedisQueueRepository.pendingKey(SESSION_ID),
      '44444444-4444-4444-4444-444444444444',
    );
    expect(client.zrem).toHaveBeenCalledWith(
      RedisQueueRepository.lockedKey(SESSION_ID),
      '44444444-4444-4444-4444-444444444444',
    );
    expect(result.guest.status).toBe('MUTED');
    expect(result.removedQueueEntryIds).toEqual(['44444444-4444-4444-4444-444444444444']);
  });

  it('blocks moderation from a non-owner host', async () => {
    const prisma = makePrisma();
    (prisma.partySession.findUnique as jest.Mock).mockResolvedValueOnce({
      hostUserId: '99999999-9999-9999-9999-999999999999',
    });
    const { redis } = makeRedis();
    const service = new GuestDisciplineService(prisma, redis);

    await expect(service.banGuest(SESSION_ID, GUEST_ID, HOST_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('does not unmute a banned guest', async () => {
    const prisma = makePrisma();
    (prisma.sessionGuest.findUnique as jest.Mock).mockResolvedValueOnce(guestRow('BANNED'));
    const { redis } = makeRedis();
    const service = new GuestDisciplineService(prisma, redis);

    await expect(service.unmuteGuest(SESSION_ID, GUEST_ID, HOST_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});
