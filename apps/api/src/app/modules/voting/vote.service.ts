import { Injectable, Logger, Optional } from '@nestjs/common';
import type { VoteDto, VoteValue } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import { PrismaService } from '../database/prisma.service';
import { QueueEntryRecord, QueueEntryRepository } from '../queue/queue-entry.repository';
import { RedisQueueRepository } from '../queue/redis-queue.repository';
import { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import { ScoringService } from '../scoring/scoring.service';
import { PartySessionRecord } from '../sessions/session.repository';
import { SessionService } from '../sessions/session.service';
import { VoteRateLimiter } from './vote-rate-limiter';
import type { VoteRecord } from './vote.repository';
import { VoteRepository } from './vote.repository';

// Statuses that should NOT accept new vote mutations. An entry that's been
// PLAYED is historical; REMOVED/VETOED are gone from the queue.
const VOTABLE_STATUSES = new Set<QueueEntryRecord['status']>([
  'PENDING',
  'LOCKED',
  'QUEUED_TO_SPOTIFY',
  'PLAYING',
]);

export interface VoteResult {
  vote: VoteDto | null;
  entry: {
    id: string;
    upvotes: number;
    downvotes: number;
    score: number;
    status: QueueEntryRecord['status'];
  };
}

@Injectable()
export class VoteService {
  private readonly logger = new Logger(VoteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly entries: QueueEntryRepository,
    private readonly votes: VoteRepository,
    private readonly redisQueue: RedisQueueRepository,
    private readonly rateLimiter: VoteRateLimiter,
    private readonly scoring: ScoringService,
    @Optional()
    private readonly realtime?: RealtimeEventPublisher,
  ) {}

  async castVote(
    entryId: string,
    guestId: string,
    guestSessionId: string,
    value: VoteValue,
  ): Promise<VoteResult> {
    await this.rateLimiter.assertAllowed(guestId);

    const { entry, session } = await this.loadVotableEntry(entryId, guestSessionId);

    const { vote, updated } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.votes.findForEntryGuest(entryId, guestId, tx);
      const { upvoteDelta, downvoteDelta } = computeDeltas(existing?.value ?? null, value);
      const newUpvotes = entry.upvotes + upvoteDelta;
      const newDownvotes = entry.downvotes + downvoteDelta;
      const newScore = this.scoring.calculate(
        {
          upvotes: newUpvotes,
          downvotes: newDownvotes,
          boostCredits: entry.boostCredits,
          hostPinned: entry.hostPinned,
          createdAt: entry.createdAt,
        },
        session.settings,
      );

      const updatedEntry = await this.entries.applyVoteDelta(
        entryId,
        upvoteDelta,
        downvoteDelta,
        newScore,
        tx,
      );
      const upsertedVote = await this.votes.upsert(entryId, guestId, value, tx);
      return { vote: upsertedVote, updated: updatedEntry };
    });

    await this.refreshZsetForEntry(updated);
    this.publishVoteEvents(guestSessionId, guestId, value, updated);

    this.logger.log(
      {
        sessionId: guestSessionId,
        guestId,
        entryId,
        value,
        upvotes: updated.upvotes,
        downvotes: updated.downvotes,
        score: updated.score,
        status: updated.status,
      },
      'Vote cast.',
    );

    return {
      vote: this.toVoteDto(vote),
      entry: {
        id: updated.id,
        upvotes: updated.upvotes,
        downvotes: updated.downvotes,
        score: updated.score,
        status: updated.status,
      },
    };
  }

  async removeVote(entryId: string, guestId: string, guestSessionId: string): Promise<VoteResult> {
    await this.rateLimiter.assertAllowed(guestId);

    const { entry, session } = await this.loadVotableEntry(entryId, guestSessionId);

    const { deleted, updated } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.votes.findForEntryGuest(entryId, guestId, tx);
      if (!existing) {
        // Idempotent removal — return the entry untouched.
        return { deleted: null as VoteRecord | null, updated: entry };
      }
      const { upvoteDelta, downvoteDelta } = computeDeltas(existing.value, null);
      const newUpvotes = entry.upvotes + upvoteDelta;
      const newDownvotes = entry.downvotes + downvoteDelta;
      const newScore = this.scoring.calculate(
        {
          upvotes: newUpvotes,
          downvotes: newDownvotes,
          boostCredits: entry.boostCredits,
          hostPinned: entry.hostPinned,
          createdAt: entry.createdAt,
        },
        session.settings,
      );

      const updatedEntry = await this.entries.applyVoteDelta(
        entryId,
        upvoteDelta,
        downvoteDelta,
        newScore,
        tx,
      );
      const removed = await this.votes.delete(entryId, guestId, tx);
      return { deleted: removed, updated: updatedEntry };
    });

    if (deleted) {
      await this.refreshZsetForEntry(updated);
      this.publishVoteEvents(guestSessionId, guestId, null, updated);
      this.logger.log(
        {
          sessionId: guestSessionId,
          guestId,
          entryId,
          upvotes: updated.upvotes,
          downvotes: updated.downvotes,
          score: updated.score,
        },
        'Vote removed.',
      );
    }

    return {
      vote: null,
      entry: {
        id: updated.id,
        upvotes: updated.upvotes,
        downvotes: updated.downvotes,
        score: updated.score,
        status: updated.status,
      },
    };
  }

  private async loadVotableEntry(
    entryId: string,
    guestSessionId: string,
  ): Promise<{ entry: QueueEntryRecord; session: PartySessionRecord }> {
    const entry = await this.entries.findById(entryId);
    if (!entry) {
      throw new DomainError('NOT_FOUND', 'Queue entry not found.');
    }
    if (entry.sessionId !== guestSessionId) {
      // Guest JWT is scoped to one session; you can't vote across sessions.
      throw new DomainError('FORBIDDEN', 'Guest token is scoped to a different session.');
    }
    // Confirms the session itself is still active — also rejects ENDED.
    const session = await this.sessions.loadJoinable(entry.sessionId);
    if (!VOTABLE_STATUSES.has(entry.status)) {
      throw new DomainError('CONFLICT', `Cannot vote on a ${entry.status} queue entry.`, {
        status: entry.status,
      });
    }
    return { entry, session };
  }

  private async refreshZsetForEntry(entry: QueueEntryRecord): Promise<void> {
    // Locked entries keep their votes recorded but stay frozen in rank
    // until the lock window expires (M10 owns the unfreeze path). We still
    // ZADD for PENDING so the live queue order reflects the new score.
    if (entry.status === 'PENDING') {
      await this.redisQueue.addPending(entry.sessionId, entry.id, entry.score);
    }
  }

  private publishVoteEvents(
    sessionId: string,
    guestId: string,
    value: VoteValue | null,
    entry: QueueEntryRecord,
  ): void {
    this.realtime?.publishVoteUpdated(sessionId, {
      entryId: entry.id,
      guestId,
      value,
      upvotes: entry.upvotes,
      downvotes: entry.downvotes,
      score: entry.score,
      status: entry.status,
    });
    this.realtime?.publishQueueUpdated(sessionId, {
      reason: 'score_changed',
      entryId: entry.id,
      status: entry.status,
    });
  }

  private toVoteDto(record: VoteRecord): VoteDto {
    return {
      id: record.id,
      entryId: record.entryId,
      guestId: record.guestId,
      value: record.value,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

// Pure helper exported only via the service for testability.
export const computeDeltas = (
  previous: VoteValue | null,
  next: VoteValue | null,
): { upvoteDelta: number; downvoteDelta: number } => {
  let upvoteDelta = 0;
  let downvoteDelta = 0;
  if (previous === 1) upvoteDelta -= 1;
  if (previous === -1) downvoteDelta -= 1;
  if (next === 1) upvoteDelta += 1;
  if (next === -1) downvoteDelta += 1;
  return { upvoteDelta, downvoteDelta };
};
