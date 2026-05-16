import { Injectable, Logger, Optional } from '@nestjs/common';
import type { QueueEntryStatus } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import { QueueEntryRecord, QueueEntryRepository } from '../queue/queue-entry.repository';
import { RedisQueueRepository } from '../queue/redis-queue.repository';
import { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import { ScoreRebuildService } from '../scoring/score-rebuild.service';
import { SessionService } from '../sessions/session.service';

const VETOABLE_STATUSES = new Set<QueueEntryStatus>(['PENDING', 'LOCKED']);

export interface QueueEntryState {
  id: string;
  sessionId: string;
  status: QueueEntryStatus;
  score: number;
  lockedUntil: string | null;
}

export interface LockWindowRunResult {
  sessionId: string;
  locked: number;
  released: number;
}

export interface VetoResult {
  entry: QueueEntryState;
}

@Injectable()
export class LockWindowService {
  private readonly logger = new Logger(LockWindowService.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly entries: QueueEntryRepository,
    private readonly redisQueue: RedisQueueRepository,
    private readonly scoreRebuild: ScoreRebuildService,
    @Optional()
    private readonly realtime?: RealtimeEventPublisher,
  ) {}

  async processSession(sessionId: string, now: Date = new Date()): Promise<LockWindowRunResult> {
    // Lock before release so an entry whose lock just expired is not re-locked
    // in the same scheduler tick before the runner has a chance to see it.
    const locked = await this.lockTopPending(sessionId, now);
    const released = await this.releaseExpiredLocks(sessionId, now);
    return { sessionId, locked: locked.length, released: released.length };
  }

  async lockTopPending(sessionId: string, now: Date = new Date()): Promise<QueueEntryRecord[]> {
    const session = await this.sessions.loadJoinable(sessionId);
    const lockSize = session.settings.lockSize;
    const activeLocks = await this.entries.countActiveLocks(sessionId, now);
    const slots = Math.max(lockSize - activeLocks, 0);
    if (slots === 0) return [];

    let candidateIds = await this.redisQueue.listTopPendingIds(sessionId, slots);
    if (candidateIds.length === 0) {
      await this.scoreRebuild.rebuildRedisProjection(sessionId);
      candidateIds = await this.redisQueue.listTopPendingIds(sessionId, slots);
    }

    const candidates = await this.entries.listPendingByIds(sessionId, candidateIds);
    const lockedUntil = new Date(now.getTime() + session.settings.lockDurationSeconds * 1000);
    const locked: QueueEntryRecord[] = [];

    for (const candidate of candidates.slice(0, slots)) {
      const updated = await this.entries.lockEntry(candidate.id, lockedUntil);
      await this.redisQueue.removeEntry(sessionId, updated.id);
      await this.redisQueue.addLocked(sessionId, updated.id, lockedUntil);
      this.realtime?.publishTrackLocked(sessionId, {
        entryId: updated.id,
        status: 'LOCKED',
        lockedUntil: lockedUntil.toISOString(),
        reason: 'window_locked',
      });
      this.realtime?.publishQueueUpdated(sessionId, {
        reason: 'lock_changed',
        entryId: updated.id,
        status: updated.status,
      });
      locked.push(updated);
    }

    if (locked.length > 0) {
      this.logger.log(
        {
          sessionId,
          lockedCount: locked.length,
          lockedUntil: lockedUntil.toISOString(),
          entryIds: locked.map((entry) => entry.id),
        },
        'Queue entries locked.',
      );
    }

    return locked;
  }

  async releaseExpiredLocks(
    sessionId: string,
    now: Date = new Date(),
  ): Promise<QueueEntryRecord[]> {
    await this.sessions.loadJoinable(sessionId);
    const expired = await this.entries.listExpiredLocks(sessionId, now);
    const released: QueueEntryRecord[] = [];

    for (const entry of expired) {
      await this.entries.unlockEntry(entry.id);
      await this.redisQueue.removeLocked(sessionId, entry.id);
      const recalculated = await this.scoreRebuild.recalculateEntry(entry.id);
      this.realtime?.publishTrackUnlocked(sessionId, {
        entryId: recalculated.id,
        status: 'PENDING',
        lockedUntil: null,
        reason: 'window_expired',
      });
      this.realtime?.publishQueueUpdated(sessionId, {
        reason: 'lock_changed',
        entryId: recalculated.id,
        status: recalculated.status,
      });
      released.push(recalculated);
    }

    if (released.length > 0) {
      this.logger.log(
        { sessionId, releasedCount: released.length, entryIds: released.map((entry) => entry.id) },
        'Expired queue locks released.',
      );
    }

    return released;
  }

  async vetoEntry(entryId: string, hostUserId: string): Promise<VetoResult> {
    const entry = await this.entries.findById(entryId);
    if (!entry) {
      throw new DomainError('NOT_FOUND', 'Queue entry not found.');
    }

    await this.sessions.getSession(entry.sessionId, hostUserId);

    if (entry.status === 'VETOED') {
      return { entry: this.toState(entry) };
    }
    if (!VETOABLE_STATUSES.has(entry.status)) {
      throw new DomainError(
        'CONFLICT',
        `Cannot veto a ${entry.status} queue entry in the lock-window flow.`,
        { status: entry.status },
      );
    }

    const updated = await this.entries.markVetoed(entryId);
    await this.redisQueue.removeEntry(updated.sessionId, updated.id);
    await this.redisQueue.removeLocked(updated.sessionId, updated.id);
    this.realtime?.publishQueueUpdated(updated.sessionId, {
      reason: 'entry_vetoed',
      entryId: updated.id,
      status: updated.status,
    });

    this.logger.warn(
      {
        sessionId: updated.sessionId,
        hostUserId,
        entryId: updated.id,
        previousStatus: entry.status,
      },
      'Queue entry vetoed by host.',
    );

    return { entry: this.toState(updated) };
  }

  private toState(entry: QueueEntryRecord): QueueEntryState {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      status: entry.status,
      score: entry.score,
      lockedUntil: entry.lockedUntil ? entry.lockedUntil.toISOString() : null,
    };
  }
}
