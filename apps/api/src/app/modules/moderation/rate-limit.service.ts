import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { DomainError } from '@fairplay/shared-utils';
import { RedisService } from '../redis/redis.service';

export type RateLimitBucket =
  | 'join'
  | 'search'
  | 'queue_add'
  | 'vote'
  | 'token_spend';

export interface RateLimitRule {
  bucket: RateLimitBucket;
  keyParts: string[];
  capacity: number;
  refillWindowSeconds: number;
  cost?: number;
  message: string;
}

const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local window_ms = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local ttl_ms = tonumber(ARGV[5])

local raw = redis.call('HMGET', key, 'tokens', 'updated_at')
local tokens = tonumber(raw[1])
local updated_at = tonumber(raw[2])

if tokens == nil or updated_at == nil then
  tokens = capacity
  updated_at = now
end

local elapsed = math.max(0, now - updated_at)
local refill = (elapsed / window_ms) * capacity
tokens = math.min(capacity, tokens + refill)

if tokens < cost then
  local missing = cost - tokens
  local retry_after = math.ceil((missing * window_ms / capacity) / 1000)
  redis.call('HMSET', key, 'tokens', tokens, 'updated_at', now)
  redis.call('PEXPIRE', key, ttl_ms)
  return {0, retry_after, tokens}
end

tokens = tokens - cost
redis.call('HMSET', key, 'tokens', tokens, 'updated_at', now)
redis.call('PEXPIRE', key, ttl_ms)
return {1, 0, tokens}
`;

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redis: RedisService) {}

  static key(rule: Pick<RateLimitRule, 'bucket' | 'keyParts'>): string {
    const digest = createHash('sha256').update(rule.keyParts.join('\0')).digest('hex').slice(0, 24);
    return `rl:${rule.bucket}:${digest}`;
  }

  async assertAllowed(rule: RateLimitRule): Promise<void> {
    const cost = rule.cost ?? 1;
    const windowMs = rule.refillWindowSeconds * 1000;
    const ttlMs = Math.max(windowMs * 2, 1000);
    const key = RateLimitService.key(rule);

    let result: unknown;
    try {
      result = await this.redis
        .getClient()
        .eval(
          TOKEN_BUCKET_LUA,
          1,
          key,
          Date.now(),
          rule.capacity,
          windowMs,
          cost,
          ttlMs,
        );
    } catch (err) {
      this.logger.warn(
        { err, bucket: rule.bucket, key },
        'Rate-limiter Redis check failed; allowing request.',
      );
      return;
    }

    const tuple = Array.isArray(result) ? result : [];
    const allowed = Number(tuple[0]) === 1;
    if (allowed) return;

    const retryAfterSec = normalizePositiveInt(tuple[1], rule.refillWindowSeconds);
    throw new DomainError('RATE_LIMITED', rule.message, {
      bucket: rule.bucket,
      retryAfterSec,
      capacity: rule.capacity,
      refillWindowSeconds: rule.refillWindowSeconds,
    });
  }
}

const normalizePositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.ceil(parsed);
};
