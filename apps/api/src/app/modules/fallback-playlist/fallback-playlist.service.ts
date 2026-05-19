import { Injectable, Logger } from '@nestjs/common';
import type { FallbackTrackDto, TrackDto } from '@fairplay/shared-types';
import { ModerationService } from '../moderation/moderation.service';
import { SessionService } from '../sessions/session.service';
import { TrackRepository } from '../tracks/track.repository';
import {
  FallbackPlaylistRepository,
  type FallbackTrackWithTrack,
  toFallbackTrackDto,
} from './fallback-playlist.repository';

const FALLBACK_MIN_QUEUE_INTERVAL_MS = 90_000;

@Injectable()
export class FallbackPlaylistService {
  private readonly logger = new Logger(FallbackPlaylistService.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly tracks: TrackRepository,
    private readonly fallbackTracks: FallbackPlaylistRepository,
    private readonly moderation: ModerationService,
  ) {}

  async list(sessionId: string, hostUserId: string): Promise<FallbackTrackDto[]> {
    await this.sessions.getSession(sessionId, hostUserId);
    const rows = await this.fallbackTracks.listBySession(sessionId);
    return rows.map(toFallbackTrackDto);
  }

  async add(
    sessionId: string,
    hostUserId: string,
    track: TrackDto,
  ): Promise<FallbackTrackDto> {
    const session = await this.sessions.getSession(sessionId, hostUserId);
    await this.moderation.assertTrackAllowed(sessionId, track, {
      allowExplicitTracks: session.settings.allowExplicitTracks,
    });

    const stored = await this.tracks.upsert(track);
    const row = await this.fallbackTracks.addTrack({
      sessionId,
      trackId: stored.id,
      addedByUserId: hostUserId,
    });
    this.logger.log(
      { sessionId, hostUserId, fallbackTrackId: row.id, spotifyTrackId: track.spotifyTrackId },
      'Fallback playlist track added.',
    );
    return toFallbackTrackDto(row);
  }

  async remove(sessionId: string, hostUserId: string, fallbackTrackId: string): Promise<void> {
    await this.sessions.getSession(sessionId, hostUserId);
    await this.fallbackTracks.removeTrack(sessionId, fallbackTrackId);
    this.logger.log({ sessionId, hostUserId, fallbackTrackId }, 'Fallback playlist track removed.');
  }

  async pickNextForRunner(
    sessionId: string,
    now: Date = new Date(),
  ): Promise<FallbackTrackWithTrack | null> {
    const lastDispatchBefore = new Date(now.getTime() - FALLBACK_MIN_QUEUE_INTERVAL_MS);
    return this.fallbackTracks.findNextForDispatch(sessionId, lastDispatchBefore);
  }

  async markQueued(fallbackTrackId: string, queuedAt: Date): Promise<FallbackTrackWithTrack> {
    return this.fallbackTracks.markQueued(fallbackTrackId, queuedAt);
  }
}
