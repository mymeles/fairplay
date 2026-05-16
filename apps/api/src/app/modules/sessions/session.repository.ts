import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_SESSION_SETTINGS,
  type SessionSettings,
  type SessionStatus,
} from '@fairplay/shared-types';
import { PrismaService } from '../database/prisma.service';

export interface PartySessionRecord {
  id: string;
  hostUserId: string;
  joinCode: string;
  qrTokenHash: string;
  status: SessionStatus;
  selectedSpotifyDeviceId: string | null;
  settings: SessionSettings;
  venueLat: number | null;
  venueLng: number | null;
  venueRadiusMeters: number | null;
  venueWifiHash: string | null;
  createdAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
}

export interface CreateSessionInput {
  hostUserId: string;
  joinCode: string;
  qrTokenHash: string;
  selectedSpotifyDeviceId: string | null;
  settings: SessionSettings;
  expiresAt: Date;
  venueLat: number | null;
  venueLng: number | null;
  venueRadiusMeters: number | null;
  venueWifiHash: string | null;
}

const toRecord = (row: {
  id: string;
  hostUserId: string;
  joinCode: string;
  qrTokenHash: string;
  status: string;
  selectedSpotifyDeviceId: string | null;
  settingsJson: Prisma.JsonValue;
  venueLat: Prisma.Decimal | null;
  venueLng: Prisma.Decimal | null;
  venueRadiusMeters: number | null;
  venueWifiHash: string | null;
  createdAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
}): PartySessionRecord => ({
  id: row.id,
  hostUserId: row.hostUserId,
  joinCode: row.joinCode,
  qrTokenHash: row.qrTokenHash,
  status: row.status as SessionStatus,
  selectedSpotifyDeviceId: row.selectedSpotifyDeviceId,
  // Old rows persisted before M09 don't have a `scoring` block. Coalesce
  // against defaults at the read seam so callers never see a partial
  // SessionSettings. New keys added in future milestones should follow this
  // same pattern.
  settings: mergeWithDefaults(row.settingsJson as Prisma.JsonValue),
  // Decimal → number is safe here: lat/lng fit comfortably in IEEE 754
  // and we already cap them in the DTO.
  venueLat: row.venueLat ? Number(row.venueLat.toString()) : null,
  venueLng: row.venueLng ? Number(row.venueLng.toString()) : null,
  venueRadiusMeters: row.venueRadiusMeters,
  venueWifiHash: row.venueWifiHash,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
  endedAt: row.endedAt,
});

const mergeWithDefaults = (json: Prisma.JsonValue): SessionSettings => {
  const partial = (json ?? {}) as Partial<SessionSettings>;
  return {
    ...DEFAULT_SESSION_SETTINGS,
    ...partial,
    scoring: {
      ...DEFAULT_SCORING_WEIGHTS,
      ...(partial.scoring ?? {}),
    },
  };
};

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateSessionInput): Promise<PartySessionRecord> {
    const row = await this.prisma.partySession.create({
      data: {
        hostUserId: input.hostUserId,
        joinCode: input.joinCode,
        qrTokenHash: input.qrTokenHash,
        selectedSpotifyDeviceId: input.selectedSpotifyDeviceId,
        settingsJson: input.settings as unknown as Prisma.InputJsonValue,
        expiresAt: input.expiresAt,
        venueLat: input.venueLat,
        venueLng: input.venueLng,
        venueRadiusMeters: input.venueRadiusMeters,
        venueWifiHash: input.venueWifiHash,
      },
    });
    return toRecord(row);
  }

  async findById(sessionId: string): Promise<PartySessionRecord | null> {
    const row = await this.prisma.partySession.findUnique({ where: { id: sessionId } });
    return row ? toRecord(row) : null;
  }

  async listActiveIds(now: Date): Promise<string[]> {
    const rows = await this.prisma.partySession.findMany({
      where: { status: 'ACTIVE', expiresAt: { gt: now } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => row.id);
  }

  async findActiveByJoinCode(joinCode: string): Promise<PartySessionRecord | null> {
    const row = await this.prisma.partySession.findFirst({
      where: { joinCode, status: 'ACTIVE' },
    });
    return row ? toRecord(row) : null;
  }

  async existsActiveJoinCode(joinCode: string): Promise<boolean> {
    const found = await this.prisma.partySession.findFirst({
      where: { joinCode, status: 'ACTIVE' },
      select: { id: true },
    });
    return found !== null;
  }

  async markEnded(sessionId: string, endedAt: Date = new Date()): Promise<PartySessionRecord> {
    const row = await this.prisma.partySession.update({
      where: { id: sessionId },
      data: { status: 'ENDED', endedAt },
    });
    return toRecord(row);
  }
}
