import { Injectable } from '@nestjs/common';
import type { VoteValue } from '@fairplay/shared-types';
import { PrismaService } from '../database/prisma.service';
import type { PrismaTxn } from '../database/prisma-txn';

export interface VoteRecord {
  id: string;
  entryId: string;
  guestId: string;
  value: VoteValue;
  createdAt: Date;
  updatedAt: Date;
}

const toRecord = (row: {
  id: string;
  entryId: string;
  guestId: string;
  value: number;
  createdAt: Date;
  updatedAt: Date;
}): VoteRecord => ({
  id: row.id,
  entryId: row.entryId,
  guestId: row.guestId,
  value: (row.value === 1 ? 1 : -1) as VoteValue,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

@Injectable()
export class VoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Returns the existing vote (if any) for the (entry, guest) pair. Used by
  // the service to compute the counter delta before upserting.
  async findForEntryGuest(
    entryId: string,
    guestId: string,
    tx: PrismaTxn = this.prisma,
  ): Promise<VoteRecord | null> {
    const row = await tx.vote.findUnique({
      where: { entryId_guestId: { entryId, guestId } },
    });
    return row ? toRecord(row) : null;
  }

  async upsert(
    entryId: string,
    guestId: string,
    value: VoteValue,
    tx: PrismaTxn = this.prisma,
  ): Promise<VoteRecord> {
    const row = await tx.vote.upsert({
      where: { entryId_guestId: { entryId, guestId } },
      create: { entryId, guestId, value },
      update: { value },
    });
    return toRecord(row);
  }

  async delete(
    entryId: string,
    guestId: string,
    tx: PrismaTxn = this.prisma,
  ): Promise<VoteRecord | null> {
    try {
      const row = await tx.vote.delete({
        where: { entryId_guestId: { entryId, guestId } },
      });
      return toRecord(row);
    } catch {
      // Idempotent: no vote to delete is not an error.
      return null;
    }
  }
}
