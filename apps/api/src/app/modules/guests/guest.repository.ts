import { Injectable } from '@nestjs/common';
import type { GuestRole, GuestStatus } from '@fairplay/shared-types';
import { PrismaService } from '../database/prisma.service';

export interface SessionGuestRecord {
  id: string;
  sessionId: string;
  displayName: string;
  deviceHash: string | null;
  role: GuestRole;
  status: GuestStatus;
  joinedAt: Date;
  lastSeenAt: Date | null;
}

export interface CreateGuestInput {
  sessionId: string;
  displayName: string;
  deviceHash: string | null;
}

const toRecord = (row: {
  id: string;
  sessionId: string;
  displayName: string;
  deviceHash: string | null;
  role: string;
  status: string;
  joinedAt: Date;
  lastSeenAt: Date | null;
}): SessionGuestRecord => ({
  id: row.id,
  sessionId: row.sessionId,
  displayName: row.displayName,
  deviceHash: row.deviceHash,
  role: row.role as GuestRole,
  status: row.status as GuestStatus,
  joinedAt: row.joinedAt,
  lastSeenAt: row.lastSeenAt,
});

@Injectable()
export class GuestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateGuestInput): Promise<SessionGuestRecord> {
    const row = await this.prisma.sessionGuest.create({
      data: {
        sessionId: input.sessionId,
        displayName: input.displayName,
        deviceHash: input.deviceHash,
      },
    });
    return toRecord(row);
  }

  async findActiveByDevice(sessionId: string, deviceHash: string): Promise<SessionGuestRecord | null> {
    const row = await this.prisma.sessionGuest.findFirst({
      where: { sessionId, deviceHash, status: 'ACTIVE' },
      orderBy: { joinedAt: 'desc' },
    });
    return row ? toRecord(row) : null;
  }

  async findLatestByDevice(sessionId: string, deviceHash: string): Promise<SessionGuestRecord | null> {
    const row = await this.prisma.sessionGuest.findFirst({
      where: { sessionId, deviceHash },
      orderBy: { joinedAt: 'desc' },
    });
    return row ? toRecord(row) : null;
  }

  async findById(guestId: string): Promise<SessionGuestRecord | null> {
    const row = await this.prisma.sessionGuest.findUnique({ where: { id: guestId } });
    return row ? toRecord(row) : null;
  }

  async touchLastSeen(guestId: string): Promise<void> {
    await this.prisma.sessionGuest.update({
      where: { id: guestId },
      data: { lastSeenAt: new Date() },
    });
  }
}
