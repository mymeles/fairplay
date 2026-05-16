import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '@fairplay/shared-utils';
import {
  QueueEntryRecord,
  QueueEntryRepository,
} from '../queue/queue-entry.repository';
import { RedisQueueRepository } from '../queue/redis-queue.repository';
import { SessionService } from '../sessions/session.service';
import { ScoringService } from './scoring.service';

// Only PENDING entries belong in the ranking ZSET — locked/queued/playing
// entries are frozen by M10's lock window or already pinned to Spotify. Their
// scores still get recomputed in Postgres so downstream consumers see fresh
// values when the lock releases (M10) or the runner reads (M12).
const PENDING_STATUS: QueueEntryRecord['status'] = 'PENDING';

// Skip a write if the recomputed score moved less than this — aging alone
// drifts ~1e-6/sec at the default weights, and we'd rather not churn the DB
// every time someone calls recalculate.
const SCORE_WRITE_EPSILON = 1e-4;

export interface RebuildResult {
  sessionId: string;
  recalculated: number;
  pendingInZset: number;
}

@Injectable()
export class ScoreRebuildService {
  private readonly logger = new Logger(ScoreRebuildService.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly entries: QueueEntryRepository,
    private readonly redisQueue: RedisQueueRepository,
    private readonly scoring: ScoringService,
  ) {}

  async recalculateEntry(entryId: string): Promise<QueueEntryRecord> {
    const entry = await this.entries.findById(entryId);
    if (!entry) {
      throw new DomainError('NOT_FOUND', 'Queue entry not found.');
    }
    const session = await this.sessions.loadJoinable(entry.sessionId);
    const score = this.scoring.calculate(entry, session.settings);
    const updated = await this.entries.setScore(entryId, score);
    if (updated.status === PENDING_STATUS) {
      await this.redisQueue.addPending(updated.sessionId, updated.id, updated.score);
    }
    this.logger.log(
      {
        sessionId: updated.sessionId,
        entryId: updated.id,
        previousScore: entry.score,
        newScore: updated.score,
      },
      'Queue entry score recalculated.',
    );
    return updated;
  }

  async recalculateSession(sessionId: string): Promise<RebuildResult> {
    const session = await this.sessions.loadJoinable(sessionId);
    const entries = await this.entries.listActiveBySession(sessionId);
    const now = new Date();
    let pendingInZset = 0;

    // Recompute Postgres scores serially so we don't open too many DB
    // connections. The session-recalculate path is an admin/dev tool, not a
    // hot loop — clarity > throughput.
    for (const entry of entries) {
      const newScore = this.scoring.calculate(entry, session.settings, now);
      if (Math.abs(newScore - entry.score) > SCORE_WRITE_EPSILON) {
        await this.entries.setScore(entry.id, newScore);
      }
      if (entry.status === PENDING_STATUS) {
        pendingInZset += 1;
      }
    }

    await this.rebuildRedisProjection(sessionId);

    this.logger.log(
      { sessionId, recalculated: entries.length, pendingInZset },
      'Session scores recalculated.',
    );

    return {
      sessionId,
      recalculated: entries.length,
      pendingInZset,
    };
  }

  // Wipes the session ZSET and rebuilds it from the durable queue_entries
  // table. Use after a recalculate, after a Redis flush, or as a safety net
  // before any operation that depends on ranking truth.
  async rebuildRedisProjection(sessionId: string): Promise<number> {
    const entries = await this.entries.listActiveBySession(sessionId);
    const pending = entries
      .filter((entry) => entry.status === PENDING_STATUS)
      .map((entry) => ({ entryId: entry.id, score: entry.score }));

    await this.redisQueue.deletePending(sessionId);
    await this.redisQueue.setPendingBulk(sessionId, pending);

    this.logger.log(
      { sessionId, pendingCount: pending.length },
      'Redis pending-queue projection rebuilt.',
    );

    return pending.length;
  }
}
