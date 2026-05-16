import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '@fairplay/shared-utils';
import { RedisService } from '../redis/redis.service';

// Per-guest fixed-window rate limit for vote mutations. Voting on multiple
// entries in a row is normal, so we keep the window short (10s) and the
// limit generous (12 actions) — anything tighter would hurt UX. The cap is
// per-guest, not per-entry, because the dominant abuse signal is bot-style
// scripting from one guest, not contention on one row.

const WINDOW_SECONDS = 10;
const MAX_ACTIONS_PER_WINDOW = 12;

@Injectable()
export class VoteRateLimiter {
  private readonly logger = new Logger(VoteRateLimiter.name);

  constructor(private readonly redis: RedisService) {}

  static key(guestId: string): string {
    return `rl:vote:${guestId}`;
  }

  async assertAllowed(guestId: string): Promise<void> {
    const key = VoteRateLimiter.key(guestId);
    let count: number;
    try {
      count = await this.redis.getClient().incr(key);
      if (count === 1) {
        await this.redis.getClient().expire(key, WINDOW_SECONDS);
      }
    } catch (err) {
      // Fail open — losing rate limiting briefly is better than denying all
      // voting. The error is logged so an outage can be diagnosed.
      this.logger.warn({ err, guestId }, 'Vote rate-limiter Redis check failed; allowing.');
      return;
    }
    if (count > MAX_ACTIONS_PER_WINDOW) {
      const ttl = await this.safeTtl(key);
      throw new DomainError(
        'RATE_LIMITED',
        'You are voting too quickly. Slow down and try again shortly.',
        {
          retryAfterSec: ttl > 0 ? ttl : WINDOW_SECONDS,
          windowSeconds: WINDOW_SECONDS,
          maxPerWindow: MAX_ACTIONS_PER_WINDOW,
        },
      );
    }
  }

  private async safeTtl(key: string): Promise<number> {
    try {
      return await this.redis.getClient().ttl(key);
    } catch {
      return -1;
    }
  }
}
