import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { QueueEntryStatus, TrackDto } from '@fairplay/shared-types';
import { PrismaService } from '../database/prisma.service';
import type { PrismaTxn } from '../database/prisma-txn';

export interface QueueEntryRecord {
  id: string;
  sessionId: string;
  trackId: string;
  addedByGuestId: string | null;
  status: QueueEntryStatus;
  upvotes: number;
  downvotes: number;
  boostCredits: number;
  score: number;
  lockedUntil: Date | null;
  hostPinned: boolean;
  spotifyQueuedAt: Date | null;
  playingAt: Date | null;
  playedAt: Date | null;
  removedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueEntryWithTrack extends QueueEntryRecord {
  track: TrackDto & { id: string; createdAt: Date };
}

export interface CreateQueueEntryInput {
  sessionId: string;
  trackId: string;
  addedByGuestId: string | null;
  score: number;
}

// PLAYED is excluded — a finished track may be re-suggested after the
// configured cooldown. PENDING / LOCKED / QUEUED_TO_SPOTIFY / PLAYING all
// count as "currently in the internal queue". REMOVED / VETOED do not.
export const ACTIVE_QUEUE_STATUSES: QueueEntryStatus[] = [
  'PENDING',
  'LOCKED',
  'QUEUED_TO_SPOTIFY',
  'PLAYING',
];

const toRecord = (row: {
  id: string;
  sessionId: string;
  trackId: string;
  addedByGuestId: string | null;
  status: string;
  upvotes: number;
  downvotes: number;
  boostCredits: number;
  score: Prisma.Decimal;
  lockedUntil: Date | null;
  hostPinned: boolean;
  spotifyQueuedAt: Date | null;
  playingAt: Date | null;
  playedAt: Date | null;
  removedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): QueueEntryRecord => ({
  id: row.id,
  sessionId: row.sessionId,
  trackId: row.trackId,
  addedByGuestId: row.addedByGuestId,
  status: row.status as QueueEntryStatus,
  upvotes: row.upvotes,
  downvotes: row.downvotes,
  boostCredits: row.boostCredits,
  score: Number(row.score.toString()),
  lockedUntil: row.lockedUntil,
  hostPinned: row.hostPinned,
  spotifyQueuedAt: row.spotifyQueuedAt,
  playingAt: row.playingAt,
  playedAt: row.playedAt,
  removedAt: row.removedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toRecordWithTrack = (
  row: Prisma.QueueEntryGetPayload<{ include: { track: true } }>,
): QueueEntryWithTrack => {
  const base = toRecord(row);
  const track = row.track;
  return {
    ...base,
    track: {
      id: track.id,
      spotifyUri: track.spotifyUri,
      spotifyTrackId: track.spotifyTrackId,
      title: track.title,
      artist: track.artist,
      ...(track.album ? { album: track.album } : {}),
      durationMs: track.durationMs,
      ...(track.artworkUrl ? { artworkUrl: track.artworkUrl } : {}),
      explicit: track.explicit,
      createdAt: track.createdAt,
    },
  };
};

@Injectable()
export class QueueEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateQueueEntryInput): Promise<QueueEntryRecord> {
    const row = await this.prisma.queueEntry.create({
      data: {
        sessionId: input.sessionId,
        trackId: input.trackId,
        addedByGuestId: input.addedByGuestId,
        // Prisma accepts a number for a Decimal column.
        score: input.score,
      },
    });
    return toRecord(row);
  }

  async findById(entryId: string): Promise<QueueEntryRecord | null> {
    const row = await this.prisma.queueEntry.findUnique({ where: { id: entryId } });
    return row ? toRecord(row) : null;
  }

  async findByIdWithTrack(entryId: string): Promise<QueueEntryWithTrack | null> {
    const row = await this.prisma.queueEntry.findUnique({
      where: { id: entryId },
      include: { track: true },
    });
    return row ? toRecordWithTrack(row) : null;
  }

  async listBySessionWithTrack(sessionId: string): Promise<QueueEntryWithTrack[]> {
    const rows = await this.prisma.queueEntry.findMany({
      where: { sessionId, status: { notIn: ['REMOVED', 'VETOED'] } },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
      include: { track: true },
    });
    return rows.map(toRecordWithTrack);
  }

  async listPendingByIds(
    sessionId: string,
    entryIds: string[],
    tx: PrismaTxn = this.prisma,
  ): Promise<QueueEntryRecord[]> {
    if (entryIds.length === 0) return [];
    const rows = await tx.queueEntry.findMany({
      where: { sessionId, id: { in: entryIds }, status: 'PENDING' },
    });
    const byId = new Map(rows.map((row) => [row.id, toRecord(row)]));
    return entryIds.flatMap((id) => {
      const found = byId.get(id);
      return found ? [found] : [];
    });
  }

  async countActiveLocks(
    sessionId: string,
    now: Date,
    tx: PrismaTxn = this.prisma,
  ): Promise<number> {
    return tx.queueEntry.count({
      where: {
        sessionId,
        status: 'LOCKED',
        OR: [{ lockedUntil: null }, { lockedUntil: { gt: now } }],
      },
    });
  }

  async listExpiredLocks(
    sessionId: string,
    now: Date,
    tx: PrismaTxn = this.prisma,
  ): Promise<QueueEntryRecord[]> {
    const rows = await tx.queueEntry.findMany({
      where: { sessionId, status: 'LOCKED', lockedUntil: { lte: now } },
      orderBy: [{ lockedUntil: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async countActiveByGuest(sessionId: string, guestId: string): Promise<number> {
    return this.prisma.queueEntry.count({
      where: {
        sessionId,
        addedByGuestId: guestId,
        status: { in: ACTIVE_QUEUE_STATUSES },
      },
    });
  }

  async findRecentForTrack(
    sessionId: string,
    trackId: string,
    cooldownCutoff: Date,
  ): Promise<QueueEntryRecord | null> {
    // Anything still in the internal queue (any active status) blocks a
    // re-suggestion outright; a PLAYED entry blocks only until its played_at
    // (or, if missing, updatedAt) crosses the cooldown cutoff.
    const row = await this.prisma.queueEntry.findFirst({
      where: {
        sessionId,
        trackId,
        OR: [
          { status: { in: ACTIVE_QUEUE_STATUSES } },
          {
            status: 'PLAYED',
            OR: [
              { playedAt: { gte: cooldownCutoff } },
              { AND: [{ playedAt: null }, { updatedAt: { gte: cooldownCutoff } }] },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toRecord(row) : null;
  }

  async markRemoved(entryId: string, removedAt: Date = new Date()): Promise<QueueEntryRecord> {
    const row = await this.prisma.queueEntry.update({
      where: { id: entryId },
      data: { status: 'REMOVED', removedAt },
    });
    return toRecord(row);
  }

  async markVetoed(
    entryId: string,
    removedAt: Date = new Date(),
    tx: PrismaTxn = this.prisma,
  ): Promise<QueueEntryRecord> {
    const row = await tx.queueEntry.update({
      where: { id: entryId },
      data: { status: 'VETOED', removedAt },
    });
    return toRecord(row);
  }

  async findByIdForUpdate(
    entryId: string,
    tx: PrismaTxn = this.prisma,
  ): Promise<QueueEntryRecord | null> {
    const row = await tx.queueEntry.findUnique({ where: { id: entryId } });
    return row ? toRecord(row) : null;
  }

  async listActiveBySession(
    sessionId: string,
    tx: PrismaTxn = this.prisma,
  ): Promise<QueueEntryRecord[]> {
    const rows = await tx.queueEntry.findMany({
      where: { sessionId, status: { in: ACTIVE_QUEUE_STATUSES } },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async setScore(
    entryId: string,
    score: number,
    tx: PrismaTxn = this.prisma,
  ): Promise<QueueEntryRecord> {
    const row = await tx.queueEntry.update({
      where: { id: entryId },
      data: { score },
    });
    return toRecord(row);
  }

  async lockEntry(
    entryId: string,
    lockedUntil: Date,
    tx: PrismaTxn = this.prisma,
  ): Promise<QueueEntryRecord> {
    const row = await tx.queueEntry.update({
      where: { id: entryId },
      data: { status: 'LOCKED', lockedUntil },
    });
    return toRecord(row);
  }

  async unlockEntry(entryId: string, tx: PrismaTxn = this.prisma): Promise<QueueEntryRecord> {
    const row = await tx.queueEntry.update({
      where: { id: entryId },
      data: { status: 'PENDING', lockedUntil: null },
    });
    return toRecord(row);
  }

  async countSpotifyBufferedBySession(
    sessionId: string,
    tx: PrismaTxn = this.prisma,
  ): Promise<number> {
    // M12 — tracks the runner has appended to Spotify's queue but that
    // haven't started playing yet. M13 will move QUEUED_TO_SPOTIFY → PLAYING
    // when now-playing sync sees the track. Together these are the buffer
    // depth the runner must not exceed.
    return tx.queueEntry.count({
      where: { sessionId, status: { in: ['QUEUED_TO_SPOTIFY', 'PLAYING'] } },
    });
  }

  async findPlayingBySession(
    sessionId: string,
    tx: PrismaTxn = this.prisma,
  ): Promise<QueueEntryRecord | null> {
    // There should be at most one PLAYING entry per session; orderBy keeps the
    // result deterministic if invariant briefly breaks during a transition.
    const row = await tx.queueEntry.findFirst({
      where: { sessionId, status: 'PLAYING' },
      orderBy: { playingAt: 'desc' },
    });
    return row ? toRecord(row) : null;
  }

  async findBySessionAndTrackUriWithTrack(
    sessionId: string,
    trackUri: string,
    statuses: ('QUEUED_TO_SPOTIFY' | 'PLAYING' | 'PENDING' | 'LOCKED')[],
    tx: PrismaTxn = this.prisma,
  ): Promise<QueueEntryWithTrack | null> {
    if (statuses.length === 0) return null;
    const row = await tx.queueEntry.findFirst({
      where: {
        sessionId,
        status: { in: statuses },
        track: { spotifyUri: trackUri },
      },
      orderBy: [{ spotifyQueuedAt: 'desc' }, { createdAt: 'asc' }],
      include: { track: true },
    });
    return row ? toRecordWithTrack(row) : null;
  }

  async markPlaying(
    entryId: string,
    playingAt: Date = new Date(),
    tx: PrismaTxn = this.prisma,
  ): Promise<QueueEntryRecord> {
    const row = await tx.queueEntry.update({
      where: { id: entryId },
      data: { status: 'PLAYING', playingAt },
    });
    return toRecord(row);
  }

  async markPlayed(
    entryId: string,
    playedAt: Date = new Date(),
    tx: PrismaTxn = this.prisma,
  ): Promise<QueueEntryRecord> {
    const row = await tx.queueEntry.update({
      where: { id: entryId },
      data: { status: 'PLAYED', playedAt },
    });
    return toRecord(row);
  }

  async markQueuedToSpotify(
    entryId: string,
    spotifyQueuedAt: Date = new Date(),
    tx: PrismaTxn = this.prisma,
  ): Promise<QueueEntryRecord> {
    const row = await tx.queueEntry.update({
      where: { id: entryId },
      data: { status: 'QUEUED_TO_SPOTIFY', spotifyQueuedAt },
    });
    return toRecord(row);
  }

  async listPendingByIdsWithTrack(
    sessionId: string,
    entryIds: string[],
    tx: PrismaTxn = this.prisma,
  ): Promise<QueueEntryWithTrack[]> {
    if (entryIds.length === 0) return [];
    const rows = await tx.queueEntry.findMany({
      where: { sessionId, id: { in: entryIds }, status: 'PENDING' },
      include: { track: true },
    });
    const byId = new Map(rows.map((row) => [row.id, toRecordWithTrack(row)]));
    return entryIds.flatMap((id) => {
      const found = byId.get(id);
      return found ? [found] : [];
    });
  }

  async applyVoteDelta(
    entryId: string,
    upvoteDelta: number,
    downvoteDelta: number,
    score: number,
    tx: PrismaTxn = this.prisma,
  ): Promise<QueueEntryRecord> {
    const row = await tx.queueEntry.update({
      where: { id: entryId },
      data: {
        upvotes: { increment: upvoteDelta },
        downvotes: { increment: downvoteDelta },
        score,
      },
    });
    return toRecord(row);
  }
}
