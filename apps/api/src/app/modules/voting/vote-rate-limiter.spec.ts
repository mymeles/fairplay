import type { RedisService } from '../redis/redis.service';
import { VoteRateLimiter } from './vote-rate-limiter';

const GUEST_ID = '22222222-2222-2222-2222-222222222222';

const makeRedis = () => {
  const client = {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(10),
  };
  const redis = {
    getClient: jest.fn().mockReturnValue(client),
  } as unknown as jest.Mocked<RedisService>;
  return { redis, client };
};

describe('VoteRateLimiter', () => {
  it('allows the first action and sets the TTL', async () => {
    const { redis, client } = makeRedis();
    const limiter = new VoteRateLimiter(redis);
    await expect(limiter.assertAllowed(GUEST_ID)).resolves.toBeUndefined();
    expect(client.incr).toHaveBeenCalledWith(`rl:vote:${GUEST_ID}`);
    expect(client.expire).toHaveBeenCalledWith(`rl:vote:${GUEST_ID}`, 10);
  });

  it('does not reset the TTL on subsequent allowed actions', async () => {
    const { redis, client } = makeRedis();
    client.incr.mockResolvedValueOnce(2);
    const limiter = new VoteRateLimiter(redis);
    await limiter.assertAllowed(GUEST_ID);
    expect(client.expire).not.toHaveBeenCalled();
  });

  it('throws RATE_LIMITED once the cap is exceeded', async () => {
    const { redis, client } = makeRedis();
    client.incr.mockResolvedValueOnce(13);
    client.ttl.mockResolvedValueOnce(7);
    const limiter = new VoteRateLimiter(redis);
    await expect(limiter.assertAllowed(GUEST_ID)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      details: { retryAfterSec: 7, windowSeconds: 10, maxPerWindow: 12 },
    });
  });

  it('fails open if Redis is unavailable so voting still works', async () => {
    const { redis, client } = makeRedis();
    client.incr.mockRejectedValueOnce(new Error('redis down'));
    const limiter = new VoteRateLimiter(redis);
    await expect(limiter.assertAllowed(GUEST_ID)).resolves.toBeUndefined();
  });
});
