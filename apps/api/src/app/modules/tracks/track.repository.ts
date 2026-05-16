import { Injectable } from '@nestjs/common';
import type { TrackDto } from '@fairplay/shared-types';
import { PrismaService } from '../database/prisma.service';

export interface TrackRecord extends TrackDto {
  id: string;
  createdAt: Date;
}

@Injectable()
export class TrackRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(track: TrackDto): Promise<TrackRecord> {
    const row = await this.prisma.track.upsert({
      where: { spotifyUri: track.spotifyUri },
      create: toPrismaData(track),
      update: toPrismaData(track),
    });
    return {
      id: row.id,
      spotifyUri: row.spotifyUri,
      spotifyTrackId: row.spotifyTrackId,
      title: row.title,
      artist: row.artist,
      ...(row.album ? { album: row.album } : {}),
      durationMs: row.durationMs,
      ...(row.artworkUrl ? { artworkUrl: row.artworkUrl } : {}),
      explicit: row.explicit,
      createdAt: row.createdAt,
    };
  }
}

const toPrismaData = (track: TrackDto) => ({
  spotifyUri: track.spotifyUri,
  spotifyTrackId: track.spotifyTrackId,
  title: track.title,
  artist: track.artist,
  album: track.album ?? null,
  durationMs: track.durationMs,
  artworkUrl: track.artworkUrl ?? null,
  explicit: track.explicit,
});

