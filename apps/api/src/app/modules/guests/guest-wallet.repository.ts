import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { PrismaTxn } from '../database/prisma-txn';

export interface GuestWalletRecord {
  guestId: string;
  sessionId: string;
  boostTokens: number;
  challengeTokens: number;
}

export interface GrantTokensInput {
  boostTokens: number;
  challengeTokens: number;
}

const toRecord = (row: {
  guestId: string;
  sessionId: string;
  boostTokens: number;
  challengeTokens: number;
}): GuestWalletRecord => ({
  guestId: row.guestId,
  sessionId: row.sessionId,
  boostTokens: row.boostTokens,
  challengeTokens: row.challengeTokens,
});

@Injectable()
export class GuestWalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: GuestWalletRecord,
    tx?: PrismaTxn,
  ): Promise<GuestWalletRecord> {
    if (tx) return this.createInTransaction(input, tx);
    return this.prisma.$transaction((transaction) =>
      this.createInTransaction(input, transaction),
    );
  }

  private async createInTransaction(
    input: GuestWalletRecord,
    tx: PrismaTxn,
  ): Promise<GuestWalletRecord> {
    const row = await tx.guestWallet.create({
      data: {
        sessionId: input.sessionId,
        guestId: input.guestId,
        boostTokens: input.boostTokens,
        challengeTokens: input.challengeTokens,
      },
    });

    const ledgerRows = [
      ...(input.boostTokens > 0
        ? [
            {
              sessionId: input.sessionId,
              guestId: input.guestId,
              tokenType: 'BOOST',
              amount: input.boostTokens,
              reason: 'JOIN_GRANT',
            },
          ]
        : []),
      ...(input.challengeTokens > 0
        ? [
            {
              sessionId: input.sessionId,
              guestId: input.guestId,
              tokenType: 'CHALLENGE',
              amount: input.challengeTokens,
              reason: 'JOIN_GRANT',
            },
          ]
        : []),
    ];
    if (ledgerRows.length > 0) {
      await tx.tokenLedger.createMany({ data: ledgerRows });
    }

    return toRecord(row);
  }

  async findByGuestId(
    guestId: string,
    tx: PrismaTxn = this.prisma,
  ): Promise<GuestWalletRecord | null> {
    const row = await tx.guestWallet.findUnique({ where: { guestId } });
    if (!row) return null;
    return toRecord(row);
  }

  async spendBoostToken(
    guestId: string,
    sessionId: string,
    tx: PrismaTxn = this.prisma,
  ): Promise<GuestWalletRecord | null> {
    const spent = await tx.guestWallet.updateMany({
      where: { guestId, sessionId, boostTokens: { gt: 0 } },
      data: { boostTokens: { decrement: 1 } },
    });
    if (spent.count !== 1) return null;

    return this.findByGuestId(guestId, tx);
  }

  async spendChallengeToken(
    guestId: string,
    sessionId: string,
    tx: PrismaTxn = this.prisma,
  ): Promise<GuestWalletRecord | null> {
    const spent = await tx.guestWallet.updateMany({
      where: { guestId, sessionId, challengeTokens: { gt: 0 } },
      data: { challengeTokens: { decrement: 1 } },
    });
    if (spent.count !== 1) return null;

    return this.findByGuestId(guestId, tx);
  }

  async grantTokens(
    guestId: string,
    sessionId: string,
    input: GrantTokensInput,
    tx: PrismaTxn = this.prisma,
  ): Promise<GuestWalletRecord | null> {
    const data: {
      boostTokens?: { increment: number };
      challengeTokens?: { increment: number };
    } = {};
    if (input.boostTokens > 0) {
      data.boostTokens = { increment: input.boostTokens };
    }
    if (input.challengeTokens > 0) {
      data.challengeTokens = { increment: input.challengeTokens };
    }

    const granted = await tx.guestWallet.updateMany({
      where: { guestId, sessionId },
      data,
    });
    if (granted.count !== 1) return null;

    return this.findByGuestId(guestId, tx);
  }
}
