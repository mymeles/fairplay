import { Injectable, Logger, Optional } from '@nestjs/common';
import type { GuestWalletSummary } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import { PrismaService } from '../database/prisma.service';
import { GuestRepository } from '../guests/guest.repository';
import { GuestWalletRepository } from '../guests/guest-wallet.repository';
import { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import { SessionService } from '../sessions/session.service';
import type { GrantTokensDto } from './dto/grant-tokens.dto';
import { TokenLedgerService, type TokenType } from './token-ledger.service';

export interface GrantTokensResult {
  wallet: GuestWalletSummary;
}

@Injectable()
export class GuestWalletService {
  private readonly logger = new Logger(GuestWalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly guests: GuestRepository,
    private readonly wallets: GuestWalletRepository,
    private readonly ledger: TokenLedgerService,
    @Optional()
    private readonly realtime?: RealtimeEventPublisher,
  ) {}

  async getWallet(guestId: string, guestSessionId: string): Promise<GuestWalletSummary> {
    const wallet = await this.wallets.findByGuestId(guestId);
    if (!wallet) {
      throw new DomainError('NOT_FOUND', 'Guest wallet not found.');
    }
    if (wallet.sessionId !== guestSessionId) {
      throw new DomainError('FORBIDDEN', 'Guest token is scoped to a different session.');
    }
    return this.toSummary(wallet);
  }

  async grantTokens(
    sessionId: string,
    guestId: string,
    hostUserId: string,
    input: GrantTokensDto,
  ): Promise<GrantTokensResult> {
    const boostTokens = input.boostTokens ?? 0;
    const challengeTokens = input.challengeTokens ?? 0;
    if (boostTokens === 0 && challengeTokens === 0) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'At least one token amount must be greater than zero.',
      );
    }

    await this.sessions.getSession(sessionId, hostUserId);
    const guest = await this.guests.findById(guestId);
    if (!guest || guest.sessionId !== sessionId) {
      throw new DomainError('NOT_FOUND', 'Guest not found in this session.');
    }

    const wallet = await this.prisma.$transaction(async (tx) => {
      const updated = await this.wallets.grantTokens(
        guestId,
        sessionId,
        { boostTokens, challengeTokens },
        tx,
      );
      if (!updated) {
        throw new DomainError('NOT_FOUND', 'Guest wallet not found.');
      }

      if (boostTokens > 0) {
        await this.ledger.record(
          {
            sessionId,
            guestId,
            tokenType: 'BOOST',
            amount: boostTokens,
            reason: 'HOST_GRANT',
          },
          tx,
        );
      }
      if (challengeTokens > 0) {
        await this.ledger.record(
          {
            sessionId,
            guestId,
            tokenType: 'CHALLENGE',
            amount: challengeTokens,
            reason: 'HOST_GRANT',
          },
          tx,
        );
      }

      return updated;
    });

    this.realtime?.publishTokenUpdated(sessionId, guestId, {
      guestId,
      tokenType: this.changedTokenType(boostTokens, challengeTokens),
      boostTokens: wallet.boostTokens,
      challengeTokens: wallet.challengeTokens,
      reason: 'host_grant',
    });

    this.logger.log(
      { sessionId, guestId, hostUserId, boostTokens, challengeTokens },
      'Host granted free session tokens.',
    );

    return { wallet: this.toSummary(wallet) };
  }

  private changedTokenType(boostTokens: number, challengeTokens: number): TokenType | 'WALLET' {
    if (boostTokens > 0 && challengeTokens === 0) return 'BOOST';
    if (challengeTokens > 0 && boostTokens === 0) return 'CHALLENGE';
    return 'WALLET';
  }

  private toSummary(wallet: GuestWalletSummary): GuestWalletSummary {
    return {
      guestId: wallet.guestId,
      sessionId: wallet.sessionId,
      boostTokens: wallet.boostTokens,
      challengeTokens: wallet.challengeTokens,
    };
  }
}
