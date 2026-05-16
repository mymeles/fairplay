import { Injectable, Logger, Optional } from '@nestjs/common';
import type { GuestWalletSummary, QueueEntryStatus } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import { PrismaService } from '../database/prisma.service';
import { GuestWalletRepository } from '../guests/guest-wallet.repository';
import { ModerationService } from '../moderation/moderation.service';
import {
  QueueEntryRecord,
  QueueEntryRepository,
} from '../queue/queue-entry.repository';
import { RedisQueueRepository } from '../queue/redis-queue.repository';
import { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import { ScoringService } from '../scoring/scoring.service';
import type { PartySessionRecord } from '../sessions/session.repository';
import { SessionService } from '../sessions/session.service';
import {
  isDuplicateLedgerSpend,
  TokenLedgerService,
} from './token-ledger.service';

export interface BoostedEntryState {
  id: string;
  sessionId: string;
  status: QueueEntryStatus;
  boostCredits: number;
  score: number;
}

export interface ApplyBoostResult {
  entry: BoostedEntryState;
  wallet: GuestWalletSummary;
  idempotent: boolean;
}

const BOOSTABLE_STATUSES = new Set<QueueEntryStatus>(['PENDING', 'LOCKED']);

@Injectable()
export class BoostService {
  private readonly logger = new Logger(BoostService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly entries: QueueEntryRepository,
    private readonly wallets: GuestWalletRepository,
    private readonly redisQueue: RedisQueueRepository,
    private readonly scoring: ScoringService,
    private readonly ledger: TokenLedgerService,
    private readonly moderation: ModerationService,
    @Optional()
    private readonly realtime?: RealtimeEventPublisher,
  ) {}

  async applyBoost(
    entryId: string,
    guestId: string,
    guestSessionId: string,
  ): Promise<ApplyBoostResult> {
    await this.moderation.assertGuestCanMutateQueue(guestSessionId, guestId, 'boost');
    const { entry, session } = await this.loadBoostableEntry(entryId, guestSessionId);
    const existingSpend = await this.ledger.findEntrySpend(
      entryId,
      guestId,
      'BOOST',
      'BOOST_SPEND',
    );
    if (existingSpend) {
      const applied = await this.loadAppliedBoost(entry, guestId);
      this.logger.log(
        { sessionId: entry.sessionId, guestId, entryId, idempotent: true },
        'Queue entry boost already applied.',
      );
      return applied;
    }

    let result: ApplyBoostResult;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const current = await this.entries.findByIdForUpdate(entryId, tx);
        if (!current) {
          throw new DomainError('NOT_FOUND', 'Queue entry not found.');
        }
        if (current.sessionId !== guestSessionId) {
          throw new DomainError('FORBIDDEN', 'Guest token is scoped to a different session.');
        }
        this.assertBoostableStatus(current.status);

        const wallet = await this.wallets.spendBoostToken(guestId, current.sessionId, tx);
        if (!wallet) {
          throw new DomainError('CONFLICT', 'You do not have a boost token available.', {
            tokenType: 'BOOST',
          });
        }

        await this.ledger.record(
          {
            sessionId: current.sessionId,
            guestId,
            entryId: current.id,
            tokenType: 'BOOST',
            amount: -1,
            reason: 'BOOST_SPEND',
          },
          tx,
        );

        const boosted = await this.entries.incrementBoostCredits(current.id, tx);
        const score = this.scoring.calculate(boosted, session.settings);
        const updated = await this.entries.setScore(boosted.id, score, tx);

        return {
          entry: this.toEntryState(updated),
          wallet: this.toWalletSummary(wallet),
          idempotent: false,
        };
      });
    } catch (err) {
      if (!isDuplicateLedgerSpend(err)) {
        throw err;
      }
      result = await this.loadAppliedBoost(entry, guestId);
    }

    if (!result.idempotent) {
      if (result.entry.status === 'PENDING') {
        await this.redisQueue.addPending(result.entry.sessionId, result.entry.id, result.entry.score);
      }
      this.realtime?.publishQueueUpdated(result.entry.sessionId, {
        reason: 'boost_applied',
        entryId: result.entry.id,
        status: result.entry.status,
      });
      this.realtime?.publishTokenUpdated(result.entry.sessionId, guestId, {
        guestId,
        tokenType: 'BOOST',
        boostTokens: result.wallet.boostTokens,
        challengeTokens: result.wallet.challengeTokens,
        reason: 'boost_applied',
      });
    }

    this.logger.log(
      {
        sessionId: result.entry.sessionId,
        guestId,
        entryId: result.entry.id,
        boostCredits: result.entry.boostCredits,
        remainingBoostTokens: result.wallet.boostTokens,
        idempotent: result.idempotent,
      },
      'Queue entry boost applied.',
    );

    return result;
  }

  private async loadBoostableEntry(
    entryId: string,
    guestSessionId: string,
  ): Promise<{ entry: QueueEntryRecord; session: PartySessionRecord }> {
    const entry = await this.entries.findById(entryId);
    if (!entry) {
      throw new DomainError('NOT_FOUND', 'Queue entry not found.');
    }
    if (entry.sessionId !== guestSessionId) {
      throw new DomainError('FORBIDDEN', 'Guest token is scoped to a different session.');
    }
    this.assertBoostableStatus(entry.status);
    const session = await this.sessions.loadJoinable(entry.sessionId);
    return { entry, session };
  }

  private async loadAppliedBoost(
    entry: QueueEntryRecord,
    guestId: string,
  ): Promise<ApplyBoostResult> {
    const wallet = await this.wallets.findByGuestId(guestId);
    if (!wallet || wallet.sessionId !== entry.sessionId) {
      throw new DomainError('NOT_FOUND', 'Guest wallet not found.');
    }
    const current = await this.entries.findById(entry.id);
    if (!current) {
      throw new DomainError('NOT_FOUND', 'Queue entry not found.');
    }
    return {
      entry: this.toEntryState(current),
      wallet: this.toWalletSummary(wallet),
      idempotent: true,
    };
  }

  private assertBoostableStatus(status: QueueEntryStatus): void {
    if (!BOOSTABLE_STATUSES.has(status)) {
      throw new DomainError('CONFLICT', `Cannot boost a ${status} queue entry.`, { status });
    }
  }

  private toEntryState(entry: QueueEntryRecord): BoostedEntryState {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      status: entry.status,
      boostCredits: entry.boostCredits,
      score: entry.score,
    };
  }

  private toWalletSummary(wallet: GuestWalletSummary): GuestWalletSummary {
    return {
      guestId: wallet.guestId,
      sessionId: wallet.sessionId,
      boostTokens: wallet.boostTokens,
      challengeTokens: wallet.challengeTokens,
    };
  }
}
