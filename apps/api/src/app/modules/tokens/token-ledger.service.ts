import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { PrismaTxn } from '../database/prisma-txn';

export type TokenType = 'BOOST' | 'CHALLENGE';
export type TokenLedgerReason =
  | 'JOIN_GRANT'
  | 'HOST_GRANT'
  | 'BOOST_SPEND'
  | 'CHALLENGE_LOCK';

export interface TokenLedgerRecord {
  id: string;
  sessionId: string;
  guestId: string;
  entryId: string | null;
  tokenType: TokenType;
  amount: number;
  reason: TokenLedgerReason;
  createdAt: Date;
}

export interface CreateTokenLedgerInput {
  sessionId: string;
  guestId: string;
  entryId?: string | null;
  tokenType: TokenType;
  amount: number;
  reason: TokenLedgerReason;
}

const toRecord = (row: {
  id: string;
  sessionId: string;
  guestId: string;
  entryId: string | null;
  tokenType: string;
  amount: number;
  reason: string;
  createdAt: Date;
}): TokenLedgerRecord => ({
  id: row.id,
  sessionId: row.sessionId,
  guestId: row.guestId,
  entryId: row.entryId,
  tokenType: row.tokenType as TokenType,
  amount: row.amount,
  reason: row.reason as TokenLedgerReason,
  createdAt: row.createdAt,
});

@Injectable()
export class TokenLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: CreateTokenLedgerInput,
    tx: PrismaTxn = this.prisma,
  ): Promise<TokenLedgerRecord> {
    const row = await tx.tokenLedger.create({
      data: {
        sessionId: input.sessionId,
        guestId: input.guestId,
        entryId: input.entryId ?? null,
        tokenType: input.tokenType,
        amount: input.amount,
        reason: input.reason,
      },
    });
    return toRecord(row);
  }

  async findEntrySpend(
    entryId: string,
    guestId: string,
    tokenType: TokenType,
    reason: Extract<TokenLedgerReason, 'BOOST_SPEND' | 'CHALLENGE_LOCK'>,
    tx: PrismaTxn = this.prisma,
  ): Promise<TokenLedgerRecord | null> {
    const row = await tx.tokenLedger.findFirst({
      where: { entryId, guestId, tokenType, reason },
    });
    return row ? toRecord(row) : null;
  }
}

export const isDuplicateLedgerSpend = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
