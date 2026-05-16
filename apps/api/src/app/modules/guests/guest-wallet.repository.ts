import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { PrismaTxn } from '../database/prisma-txn';

export interface GuestWalletRecord {
  guestId: string;
  sessionId: string;
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

  async create(input: GuestWalletRecord): Promise<GuestWalletRecord> {
    const row = await this.prisma.guestWallet.create({
      data: {
        sessionId: input.sessionId,
        guestId: input.guestId,
        boostTokens: input.boostTokens,
        challengeTokens: input.challengeTokens,
      },
    });
    return toRecord(row);
  }

  async findByGuestId(guestId: string): Promise<GuestWalletRecord | null> {
    const row = await this.prisma.guestWallet.findUnique({ where: { guestId } });
    if (!row) return null;
    return toRecord(row);
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

    const row = await tx.guestWallet.findUnique({ where: { guestId } });
    return row ? toRecord(row) : null;
  }
}
