import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { FallbackTrackDto, TrackDto } from '@fairplay/shared-types';
import { PrismaService } from '../database/prisma.service';

export interface FallbackTrackWithTrack {
  id: string;
  sessionId: string;
  trackId: string;
  addedByUserId: string;
  position: number;
  enabled: boolean;
  lastQueuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  track: TrackDto & { id: string; createdAt: Date };
}

const toRecord = (
  row: Prisma.SessionFallbackTrackGetPayload<{ include: { track: true } }>,
): FallbackTrackWithTrack => ({
  id: row.id,
  sessionId: row.sessionId,
  trackId: row.trackId,
  addedByUserId: row.addedByUserId,
  position: row.position,
  enabled: row.enabled,
  lastQueuedAt: row.lastQueuedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  track: {
    id: row.track.id,
    spotifyUri: row.track.spotifyUri,
    spotifyTrackId: row.track.spotifyTrackId,
    title: row.track.title,
    artist: row.track.artist,
    ...(row.track.album ? { album: row.track.album } : {}),
    durationMs: row.track.durationMs,
    ...(row.track.artworkUrl ? { artworkUrl: row.track.artworkUrl } : {}),
    explicit: row.track.explicit,
    createdAt: row.track.createdAt,
  },
});

export const toFallbackTrackDto = (record: FallbackTrackWithTrack): FallbackTrackDto => ({
  id: record.id,
  sessionId: record.sessionId,
  trackId: record.trackId,
  position: record.position,
  enabled: record.enabled,
  lastQueuedAt: record.lastQueuedAt ? record.lastQueuedAt.toISOString() : null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  track: {
    spotifyUri: record.track.spotifyUri,
    spotifyTrackId: record.track.spotifyTrackId,
    title: record.track.title,
    artist: record.track.artist,
    ...(record.track.album ? { album: record.track.album } : {}),
    durationMs: record.track.durationMs,
    ...(record.track.artworkUrl ? { artworkUrl: record.track.artworkUrl } : {}),
    explicit: record.track.explicit,
  },
});

@Injectable()
export class FallbackPlaylistRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listBySession(sessionId: string): Promise<FallbackTrackWithTrack[]> {
    const rows = await this.prisma.sessionFallbackTrack.findMany({
      where: { sessionId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { track: true },
    });
    return rows.map(toRecord);
  }

  async addTrack(input: {
    sessionId: string;
    trackId: string;
    addedByUserId: string;
  }): Promise<FallbackTrackWithTrack> {
    const nextPosition = await this.nextPosition(input.sessionId);
    const row = await this.prisma.sessionFallbackTrack.upsert({
      where: {
        sessionId_trackId: {
          sessionId: input.sessionId,
          trackId: input.trackId,
        },
      },
      create: {
        sessionId: input.sessionId,
        trackId: input.trackId,
        addedByUserId: input.addedByUserId,
        position: nextPosition,
      },
      update: {
        enabled: true,
      },
      include: { track: true },
    });
    return toRecord(row);
  }

  async removeTrack(sessionId: string, fallbackTrackId: string): Promise<void> {
    await this.prisma.sessionFallbackTrack.deleteMany({
      where: { id: fallbackTrackId, sessionId },
    });
  }

  async findNextForDispatch(
    sessionId: string,
    lastDispatchBefore: Date,
  ): Promise<FallbackTrackWithTrack | null> {
    const recent = await this.prisma.sessionFallbackTrack.findFirst({
      where: {
        sessionId,
        enabled: true,
        lastQueuedAt: { gt: lastDispatchBefore },
      },
      select: { id: true },
    });
    if (recent) return null;

    const row = await this.prisma.sessionFallbackTrack.findFirst({
      where: { sessionId, enabled: true },
      orderBy: [{ lastQueuedAt: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
      include: { track: true },
    });
    return row ? toRecord(row) : null;
  }

  async markQueued(fallbackTrackId: string, queuedAt: Date): Promise<FallbackTrackWithTrack> {
    const row = await this.prisma.sessionFallbackTrack.update({
      where: { id: fallbackTrackId },
      data: { lastQueuedAt: queuedAt },
      include: { track: true },
    });
    return toRecord(row);
  }

  private async nextPosition(sessionId: string): Promise<number> {
    const latest = await this.prisma.sessionFallbackTrack.findFirst({
      where: { sessionId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return (latest?.position ?? 0) + 1;
  }
}
