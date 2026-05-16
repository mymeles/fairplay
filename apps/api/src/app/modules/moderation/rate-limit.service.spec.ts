import type { RedisService } from '../redis/redis.service';
import { RateLimitService } from './rate-limit.service';

const makeRedis = (evalResult: unknown = [1, 0, 4]) => {
  const client = {
    eval: jest.fn().mockResolvedValue(evalResult),
  };
  const redis = {
    getClient: jest.fn().mockReturnValue(client),
  } as unknown as jest.Mocked<RedisService>;
  return { redis, client };
};

const rule = {
  bucket: 'search' as const,
  keyParts: ['session-1', 'guest-1'],
  capacity: 20,
  refillWindowSeconds: 60,
  message: 'slow down',
};

describe('RateLimitService', () => {
  it('allows requests when the Redis token bucket has capacity', async () => {
    const { redis, client } = makeRedis([1, 0, 19]);
    const service = new RateLimitService(redis);

    await expect(service.assertAllowed(rule)).resolves.toBeUndefined();

    expect(client.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.stringMatching(/^rl:search:/),
      expect.any(Number),
      20,
      60_000,
      1,
      120_000,
    );
  });

  it('throws RATE_LIMITED with retry details when empty', async () => {
    const { redis } = makeRedis([0, 7, 0]);
    const service = new RateLimitService(redis);

    await expect(service.assertAllowed(rule)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      details: expect.objectContaining({
        bucket: 'search',
        retryAfterSec: 7,
        capacity: 20,
      }),
    });
  });

  it('fails open when Redis is unavailable', async () => {
    const { redis, client } = makeRedis();
    client.eval.mockRejectedValueOnce(new Error('redis down'));
    const service = new RateLimitService(redis);

    await expect(service.assertAllowed(rule)).resolves.toBeUndefined();
  });
});
