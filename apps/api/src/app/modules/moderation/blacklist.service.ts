import { Injectable, Logger } from '@nestjs/common';
import type { TrackDto } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import { PrismaService } from '../database/prisma.service';
import type { BlacklistArtistDto } from './dto/blacklist-artist.dto';
import type { BlacklistTrackDto } from './dto/blacklist-track.dto';

export interface TrackBlacklistRecord {
  id: string;
  sessionId: string;
  spotifyTrackId: string;
  spotifyUri: string | null;
  title: string | null;
  createdByUserId: string;
  createdAt: string;
}

export interface ArtistBlacklistRecord {
  id: string;
  sessionId: string;
  artistName: string;
  normalizedArtistName: string;
  createdByUserId: string;
  createdAt: string;
}

@Injectable()
export class BlacklistService {
  private readonly logger = new Logger(BlacklistService.name);

  constructor(private readonly prisma: PrismaService) {}

  async blacklistTrack(
    sessionId: string,
    hostUserId: string,
    input: BlacklistTrackDto,
  ): Promise<TrackBlacklistRecord> {
    await this.assertHostOwnsSession(sessionId, hostUserId);
    const spotifyTrackId = normalizeSpotifyTrackId(input.spotifyTrackId, input.spotifyUri);
    if (!spotifyTrackId) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'spotifyTrackId or spotifyUri is required to blacklist a track.',
      );
    }

    const row = await this.prisma.sessionTrackBlacklist.upsert({
      where: { sessionId_spotifyTrackId: { sessionId, spotifyTrackId } },
      create: {
        sessionId,
        spotifyTrackId,
        spotifyUri: input.spotifyUri ?? `spotify:track:${spotifyTrackId}`,
        title: cleanOptional(input.title),
        createdByUserId: hostUserId,
      },
      update: {
        spotifyUri: input.spotifyUri ?? `spotify:track:${spotifyTrackId}`,
        title: cleanOptional(input.title),
        createdByUserId: hostUserId,
      },
    });

    this.logger.warn(
      { sessionId, hostUserId, spotifyTrackId },
      'Track blacklisted by host.',
    );
    return toTrackBlacklistRecord(row);
  }

  async blacklistArtist(
    sessionId: string,
    hostUserId: string,
    input: BlacklistArtistDto,
  ): Promise<ArtistBlacklistRecord> {
    await this.assertHostOwnsSession(sessionId, hostUserId);
    const artistName = input.artistName.trim();
    const normalizedArtistName = normalizeArtistName(artistName);
    if (!normalizedArtistName) {
      throw new DomainError('VALIDATION_FAILED', 'Artist name cannot be empty.');
    }

    const row = await this.prisma.sessionArtistBlacklist.upsert({
      where: { sessionId_normalizedArtistName: { sessionId, normalizedArtistName } },
      create: {
        sessionId,
        artistName,
        normalizedArtistName,
        createdByUserId: hostUserId,
      },
      update: {
        artistName,
        createdByUserId: hostUserId,
      },
    });

    this.logger.warn(
      { sessionId, hostUserId, normalizedArtistName },
      'Artist blacklisted by host.',
    );
    return toArtistBlacklistRecord(row);
  }

  async assertTrackAllowed(sessionId: string, track: TrackDto): Promise<void> {
    const trackBlocked = await this.prisma.sessionTrackBlacklist.findUnique({
      where: {
        sessionId_spotifyTrackId: {
          sessionId,
          spotifyTrackId: track.spotifyTrackId,
        },
      },
    });
    if (trackBlocked) {
      throw new DomainError('FORBIDDEN', 'This track is blacklisted for the session.', {
        spotifyTrackId: track.spotifyTrackId,
      });
    }

    const candidates = artistNameCandidates(track.artist);
    if (candidates.length === 0) return;
    const artistBlocked = await this.prisma.sessionArtistBlacklist.findFirst({
      where: { sessionId, normalizedArtistName: { in: candidates } },
    });
    if (artistBlocked) {
      throw new DomainError('FORBIDDEN', 'This artist is blacklisted for the session.', {
        artistName: artistBlocked.artistName,
      });
    }
  }

  private async assertHostOwnsSession(sessionId: string, hostUserId: string): Promise<void> {
    const session = await this.prisma.partySession.findUnique({
      where: { id: sessionId },
      select: { id: true, hostUserId: true },
    });
    if (!session) {
      throw new DomainError('NOT_FOUND', 'Session not found.');
    }
    if (session.hostUserId !== hostUserId) {
      throw new DomainError('FORBIDDEN', 'Host does not own this session.');
    }
  }
}

export const normalizeArtistName = (value: string): string =>
  value
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

export const artistNameCandidates = (artist: string): string[] => {
  const values = [artist, ...artist.split(',')];
  return [...new Set(values.map(normalizeArtistName).filter(Boolean))];
};

const normalizeSpotifyTrackId = (
  spotifyTrackId: string | undefined,
  spotifyUri: string | undefined,
): string | null => {
  const explicit = spotifyTrackId?.trim();
  if (explicit) return explicit;
  const uri = spotifyUri?.trim();
  const prefix = 'spotify:track:';
  if (uri?.startsWith(prefix)) return uri.slice(prefix.length);
  return null;
};

const cleanOptional = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const toTrackBlacklistRecord = (row: {
  id: string;
  sessionId: string;
  spotifyTrackId: string;
  spotifyUri: string | null;
  title: string | null;
  createdByUserId: string;
  createdAt: Date;
}): TrackBlacklistRecord => ({
  id: row.id,
  sessionId: row.sessionId,
  spotifyTrackId: row.spotifyTrackId,
  spotifyUri: row.spotifyUri,
  title: row.title,
  createdByUserId: row.createdByUserId,
  createdAt: row.createdAt.toISOString(),
});

const toArtistBlacklistRecord = (row: {
  id: string;
  sessionId: string;
  artistName: string;
  normalizedArtistName: string;
  createdByUserId: string;
  createdAt: Date;
}): ArtistBlacklistRecord => ({
  id: row.id,
  sessionId: row.sessionId,
  artistName: row.artistName,
  normalizedArtistName: row.normalizedArtistName,
  createdByUserId: row.createdByUserId,
  createdAt: row.createdAt.toISOString(),
});
