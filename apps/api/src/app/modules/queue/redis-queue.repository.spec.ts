import type { RedisService } from '../redis/redis.service';
import { RedisQueueRepository } from './redis-queue.repository';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const ENTRY_ID = '22222222-2222-2222-2222-222222222222';

const makeRedis = () => {
  const client = {
    zadd: jest.fn().mockResolvedValue(1),
    zrem: jest.fn().mockResolvedValue(1),
    zrevrange: jest.fn().mockResolvedValue([]),
    zrangebyscore: jest.fn().mockResolvedValue([]),
  };
  const redis = {
    getClient: jest.fn().mockReturnValue(client),
  } as unknown as jest.Mocked<RedisService>;
  return { redis, client };
};

describe('RedisQueueRepository', () => {
  it('writes the ZADD against the namespaced session key', async () => {
    const { redis, client } = makeRedis();
    const repo = new RedisQueueRepository(redis);
    await repo.addPending(SESSION_ID, ENTRY_ID, 7);
    expect(client.zadd).toHaveBeenCalledWith(`party:${SESSION_ID}:pending`, 7, ENTRY_ID);
  });

  it('ZREMs the entry from the namespaced session key', async () => {
    const { redis, client } = makeRedis();
    const repo = new RedisQueueRepository(redis);
    await repo.removeEntry(SESSION_ID, ENTRY_ID);
    expect(client.zrem).toHaveBeenCalledWith(`party:${SESSION_ID}:pending`, ENTRY_ID);
  });

  it('lists pending entries highest score first', async () => {
    const { redis, client } = makeRedis();
    client.zrevrange.mockResolvedValueOnce(['e1', 'e2']);
    const repo = new RedisQueueRepository(redis);
    await expect(repo.listPendingIds(SESSION_ID)).resolves.toEqual(['e1', 'e2']);
    expect(client.zrevrange).toHaveBeenCalledWith(`party:${SESSION_ID}:pending`, 0, -1);
  });

  it('lists top pending entries with a bounded ZREVRANGE', async () => {
    const { redis, client } = makeRedis();
    client.zrevrange.mockResolvedValueOnce(['e1', 'e2']);
    const repo = new RedisQueueRepository(redis);
    await expect(repo.listTopPendingIds(SESSION_ID, 2)).resolves.toEqual(['e1', 'e2']);
    expect(client.zrevrange).toHaveBeenCalledWith(`party:${SESSION_ID}:pending`, 0, 1);
  });

  it('writes locked entries to the locked ZSET by expiration time', async () => {
    const { redis, client } = makeRedis();
    const repo = new RedisQueueRepository(redis);
    const lockedUntil = new Date('2026-01-01T00:01:30.000Z');

    await repo.addLocked(SESSION_ID, ENTRY_ID, lockedUntil);

    expect(client.zadd).toHaveBeenCalledWith(
      `party:${SESSION_ID}:locked`,
      lockedUntil.getTime(),
      ENTRY_ID,
    );
  });

  it('removes locked entries from the locked ZSET', async () => {
    const { redis, client } = makeRedis();
    const repo = new RedisQueueRepository(redis);

    await repo.removeLocked(SESSION_ID, ENTRY_ID);

    expect(client.zrem).toHaveBeenCalledWith(`party:${SESSION_ID}:locked`, ENTRY_ID);
  });

  it('lists expired locked entries by lock expiration score', async () => {
    const { redis, client } = makeRedis();
    client.zrangebyscore.mockResolvedValueOnce([ENTRY_ID]);
    const repo = new RedisQueueRepository(redis);
    const now = new Date('2026-01-01T00:02:00.000Z');

    await expect(repo.listExpiredLockedIds(SESSION_ID, now)).resolves.toEqual([ENTRY_ID]);
    expect(client.zrangebyscore).toHaveBeenCalledWith(
      `party:${SESSION_ID}:locked`,
      0,
      now.getTime(),
    );
  });

  it('swallows ZADD errors so the DB write remains the source of truth', async () => {
    const { redis, client } = makeRedis();
    client.zadd.mockRejectedValueOnce(new Error('boom'));
    const repo = new RedisQueueRepository(redis);
    await expect(repo.addPending(SESSION_ID, ENTRY_ID, 0)).resolves.toBeUndefined();
  });
});
