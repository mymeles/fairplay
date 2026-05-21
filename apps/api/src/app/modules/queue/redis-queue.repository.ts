import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

// Redis ZSET layout (per session):
//   key:   party:{sessionId}:pending
//   member: queueEntryId (uuid)
//   score:  numeric score (higher = ranks first when read with ZREVRANGE)
//
// Locked entries use a sibling ZSET:
//   key:   party:{sessionId}:locked
//   member: queueEntryId (uuid)
//   score:  lockedUntil epoch millis (lower = expires sooner)
//
// Postgres is the durable source of truth; the ZSET is a ranking projection
// rebuildable from Postgres (see SYSTEM_PATTERNS rule 7). All mutations here
// are best-effort: callers must not assume atomicity with DB writes.

@Injectable()
export class RedisQueueRepository {
  private readonly logger = new Logger(RedisQueueRepository.name);

  constructor(private readonly redis: RedisService) {}

  static pendingKey(sessionId: string): string {
    return `party:${sessionId}:pending`;
  }

  static lockedKey(sessionId: string): string {
    return `party:${sessionId}:locked`;
  }

  static dispatchLockKey(sessionId: string): string {
    return `runner:dispatch:${sessionId}`;
  }

  static addLockKey(sessionId: string, trackId: string): string {
    return `queue:add:${sessionId}:${trackId}`;
  }

  // SET key value NX EX seconds. Returns true if we acquired the lock; false
  // if another worker (or a stale tick on a slow Spotify call) already holds
  // it. The token argument is opaque — pass anything unique enough to log.
  async acquireDispatchLock(
    sessionId: string,
    token: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    try {
      const res = await this.redis
        .getClient()
        .set(RedisQueueRepository.dispatchLockKey(sessionId), token, 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    } catch (err) {
      this.logger.warn({ err, sessionId }, 'Redis SET NX failed for dispatch lock.');
      // Fail closed — if Redis is down we'd rather skip a tick than risk
      // double-dispatching.
      return false;
    }
  }

  async releaseDispatchLock(sessionId: string, token: string): Promise<void> {
    try {
      // Best-effort GET+DEL — using a Lua script for compare-and-delete is
      // safer but the TTL fallback already prevents indefinite contention.
      const client = this.redis.getClient();
      const current = await client.get(RedisQueueRepository.dispatchLockKey(sessionId));
      if (current === token) {
        await client.del(RedisQueueRepository.dispatchLockKey(sessionId));
      }
    } catch (err) {
      this.logger.warn({ err, sessionId }, 'Redis dispatch lock release failed.');
    }
  }

  async acquireAddLock(sessionId: string, trackId: string, token: string): Promise<boolean> {
    try {
      const res = await this.redis
        .getClient()
        .set(RedisQueueRepository.addLockKey(sessionId, trackId), token, 'EX', 10, 'NX');
      return res === 'OK';
    } catch (err) {
      this.logger.warn({ err, sessionId, trackId }, 'Redis SET NX failed for queue add lock.');
      return false;
    }
  }

  async releaseAddLock(sessionId: string, trackId: string, token: string): Promise<void> {
    try {
      const client = this.redis.getClient();
      const key = RedisQueueRepository.addLockKey(sessionId, trackId);
      const current = await client.get(key);
      if (current === token) {
        await client.del(key);
      }
    } catch (err) {
      this.logger.warn({ err, sessionId, trackId }, 'Redis queue add lock release failed.');
    }
  }

  async addPending(sessionId: string, entryId: string, score: number): Promise<void> {
    try {
      await this.redis.getClient().zadd(RedisQueueRepository.pendingKey(sessionId), score, entryId);
    } catch (err) {
      this.logger.warn({ err, sessionId, entryId }, 'Redis ZADD failed for pending queue.');
    }
  }

  async removeEntry(sessionId: string, entryId: string): Promise<void> {
    try {
      await this.redis.getClient().zrem(RedisQueueRepository.pendingKey(sessionId), entryId);
    } catch (err) {
      this.logger.warn({ err, sessionId, entryId }, 'Redis ZREM failed for pending queue.');
    }
  }

  async deletePending(sessionId: string): Promise<void> {
    try {
      await this.redis.getClient().del(RedisQueueRepository.pendingKey(sessionId));
    } catch (err) {
      this.logger.warn({ err, sessionId }, 'Redis DEL failed for pending queue.');
    }
  }

  async setPendingBulk(
    sessionId: string,
    entries: { entryId: string; score: number }[],
  ): Promise<void> {
    if (entries.length === 0) return;
    try {
      // ZADD with multiple score/member pairs is one round-trip; the ioredis
      // typings spread as (key, score, member, score, member, ...). Build the
      // pairs array explicitly to avoid any type cleverness.
      const args: (string | number)[] = [];
      for (const entry of entries) {
        args.push(entry.score, entry.entryId);
      }
      await this.redis.getClient().zadd(RedisQueueRepository.pendingKey(sessionId), ...args);
    } catch (err) {
      this.logger.warn(
        { err, sessionId, count: entries.length },
        'Redis bulk ZADD failed for pending queue.',
      );
    }
  }

  async listPendingIds(sessionId: string): Promise<string[]> {
    try {
      // ZREVRANGE returns members ranked highest score → lowest. Ties fall
      // back to lexicographic order on the member (entry uuid); that's fine
      // for M07 — voting in M08 will keep scores diverging.
      return await this.redis
        .getClient()
        .zrevrange(RedisQueueRepository.pendingKey(sessionId), 0, -1);
    } catch (err) {
      this.logger.warn({ err, sessionId }, 'Redis ZREVRANGE failed for pending queue.');
      return [];
    }
  }

  async listTopPendingIds(sessionId: string, limit: number): Promise<string[]> {
    if (limit <= 0) return [];
    try {
      return await this.redis
        .getClient()
        .zrevrange(RedisQueueRepository.pendingKey(sessionId), 0, limit - 1);
    } catch (err) {
      this.logger.warn({ err, sessionId, limit }, 'Redis ZREVRANGE failed for top pending queue.');
      return [];
    }
  }

  async addLocked(sessionId: string, entryId: string, lockedUntil: Date): Promise<void> {
    try {
      await this.redis
        .getClient()
        .zadd(RedisQueueRepository.lockedKey(sessionId), lockedUntil.getTime(), entryId);
    } catch (err) {
      this.logger.warn({ err, sessionId, entryId }, 'Redis ZADD failed for locked queue.');
    }
  }

  async removeLocked(sessionId: string, entryId: string): Promise<void> {
    try {
      await this.redis.getClient().zrem(RedisQueueRepository.lockedKey(sessionId), entryId);
    } catch (err) {
      this.logger.warn({ err, sessionId, entryId }, 'Redis ZREM failed for locked queue.');
    }
  }

  async listExpiredLockedIds(sessionId: string, now: Date): Promise<string[]> {
    try {
      return await this.redis
        .getClient()
        .zrangebyscore(RedisQueueRepository.lockedKey(sessionId), 0, now.getTime());
    } catch (err) {
      this.logger.warn({ err, sessionId }, 'Redis ZRANGEBYSCORE failed for locked queue.');
      return [];
    }
  }
}
