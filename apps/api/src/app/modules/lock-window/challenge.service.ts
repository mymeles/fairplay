import { Injectable, Logger, Optional } from '@nestjs/common';
import type { GuestWalletSummary, QueueEntryStatus } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import { PrismaService } from '../database/prisma.service';
import { GuestWalletRepository } from '../guests/guest-wallet.repository';
import { QueueEntryRecord, QueueEntryRepository } from '../queue/queue-entry.repository';
import { RedisQueueRepository } from '../queue/redis-queue.repository';
import { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import { ScoreRebuildService } from '../scoring/score-rebuild.service';
import { SessionService } from '../sessions/session.service';
import { TokenLedgerService } from '../tokens/token-ledger.service';
import type { QueueEntryState } from './lock-window.service';

export interface ChallengeLockResult {
  entry: QueueEntryState;
  wallet: GuestWalletSummary;
}

@Injectable()
export class ChallengeService {
  private readonly logger = new Logger(ChallengeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly entries: QueueEntryRepository,
    private readonly wallets: GuestWalletRepository,
    private readonly redisQueue: RedisQueueRepository,
    private readonly scoreRebuild: ScoreRebuildService,
    private readonly ledger: TokenLedgerService,
    @Optional()
    private readonly realtime?: RealtimeEventPublisher,
  ) {}

  async challengeLock(
    entryId: string,
    guestId: string,
    guestSessionId: string,
  ): Promise<ChallengeLockResult> {
    const entry = await this.loadChallengeableEntry(entryId, guestSessionId);
    await this.sessions.loadJoinable(entry.sessionId);

    const wallet = await this.prisma.$transaction(async (tx) => {
      const current = await this.entries.findByIdForUpdate(entryId, tx);
      if (!current) {
        throw new DomainError('NOT_FOUND', 'Queue entry not found.');
      }
      if (current.sessionId !== guestSessionId) {
        throw new DomainError('FORBIDDEN', 'Guest token is scoped to a different session.');
      }
      this.assertChallengeableStatus(current.status);

      const updatedWallet = await this.wallets.spendChallengeToken(guestId, current.sessionId, tx);
      if (!updatedWallet) {
        throw new DomainError('CONFLICT', 'You do not have a challenge token available.', {
          tokenType: 'CHALLENGE',
        });
      }

      await this.ledger.record(
        {
          sessionId: current.sessionId,
          guestId,
          entryId: current.id,
          tokenType: 'CHALLENGE',
          amount: -1,
          reason: 'CHALLENGE_LOCK',
        },
        tx,
      );
      await this.entries.unlockEntry(entryId, tx);
      return updatedWallet;
    });

    await this.redisQueue.removeLocked(entry.sessionId, entry.id);
    const recalculated = await this.scoreRebuild.recalculateEntry(entry.id);
    this.realtime?.publishTrackUnlocked(recalculated.sessionId, {
      entryId: recalculated.id,
      status: 'PENDING',
      lockedUntil: null,
      reason: 'challenge',
    });
    this.realtime?.publishQueueUpdated(recalculated.sessionId, {
      reason: 'lock_changed',
      entryId: recalculated.id,
      status: recalculated.status,
    });
    this.realtime?.publishTokenUpdated(recalculated.sessionId, guestId, {
      guestId,
      tokenType: 'CHALLENGE',
      boostTokens: wallet.boostTokens,
      challengeTokens: wallet.challengeTokens,
      reason: 'challenge_lock',
    });

    this.logger.log(
      {
        sessionId: recalculated.sessionId,
        guestId,
        entryId: recalculated.id,
        remainingChallengeTokens: wallet.challengeTokens,
      },
      'Queue lock challenged.',
    );

    return {
      entry: this.toState(recalculated),
      wallet: {
        guestId: wallet.guestId,
        sessionId: wallet.sessionId,
        boostTokens: wallet.boostTokens,
        challengeTokens: wallet.challengeTokens,
      },
    };
  }

  private async loadChallengeableEntry(
    entryId: string,
    guestSessionId: string,
  ): Promise<QueueEntryRecord> {
    const entry = await this.entries.findById(entryId);
    if (!entry) {
      throw new DomainError('NOT_FOUND', 'Queue entry not found.');
    }
    if (entry.sessionId !== guestSessionId) {
      throw new DomainError('FORBIDDEN', 'Guest token is scoped to a different session.');
    }
    this.assertChallengeableStatus(entry.status);
    return entry;
  }

  private assertChallengeableStatus(status: QueueEntryStatus): void {
    if (status !== 'LOCKED') {
      throw new DomainError('CONFLICT', `Cannot challenge a ${status} queue entry.`, { status });
    }
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
