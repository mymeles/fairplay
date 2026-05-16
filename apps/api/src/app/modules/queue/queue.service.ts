import { Injectable, Logger, Optional } from '@nestjs/common';
import type { QueueEntryDto, TrackDto } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import { ModerationService } from '../moderation/moderation.service';
import { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import { ScoringService } from '../scoring/scoring.service';
import { SessionService } from '../sessions/session.service';
import type { SpotifyTrackItemDto } from '../tracks/spotify-search.adapter';
import { TrackNormalizer } from '../tracks/track-normalizer';
import { TrackRepository } from '../tracks/track.repository';
import {
  QueueEntryRecord,
  QueueEntryRepository,
  QueueEntryWithTrack,
} from './queue-entry.repository';
import { RedisQueueRepository } from './redis-queue.repository';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly tracks: TrackRepository,
    private readonly normalizer: TrackNormalizer,
    private readonly entries: QueueEntryRepository,
    private readonly redisQueue: RedisQueueRepository,
    private readonly scoring: ScoringService,
    private readonly moderation: ModerationService,
    @Optional()
    private readonly realtime?: RealtimeEventPublisher,
  ) {}

  async addTrack(
    sessionId: string,
    guestId: string,
    spotifyTrack: SpotifyTrackItemDto,
  ): Promise<QueueEntryDto> {
    const session = await this.sessions.loadJoinable(sessionId);
    await this.moderation.assertGuestCanMutateQueue(sessionId, guestId, 'queue_add');

    const normalized = this.normalizer.normalize(spotifyTrack);
    if (!normalized) {
      throw new DomainError('VALIDATION_FAILED', 'Spotify track could not be normalized.');
    }
    await this.moderation.assertTrackAllowed(sessionId, normalized, {
      allowExplicitTracks: session.settings.allowExplicitTracks,
    });

    const track = await this.tracks.upsert(normalized);

    await this.enforceMaxSuggestions(sessionId, guestId, session.settings.maxSuggestionsPerGuest);
    await this.enforceDuplicateCooldown(
      sessionId,
      track.id,
      session.settings.duplicateCooldownSeconds,
    );

    // Fresh entry: zero counters, no boosts, no host-pin, age = 0. The
    // formula returns 0 today; once boosts (M15) or host-pins (M14) are
    // applied between create and ZADD, this score path will still be right.
    const now = new Date();
    const score = this.scoring.calculate(
      {
        upvotes: 0,
        downvotes: 0,
        boostCredits: 0,
        hostPinned: false,
        createdAt: now,
      },
      session.settings,
      now,
    );
    const entry = await this.entries.create({
      sessionId,
      trackId: track.id,
      addedByGuestId: guestId,
      score,
    });

    await this.redisQueue.addPending(sessionId, entry.id, score);
    this.realtime?.publishQueueUpdated(sessionId, {
      reason: 'entry_added',
      entryId: entry.id,
      status: entry.status,
    });

    this.logger.log(
      {
        sessionId,
        guestId,
        entryId: entry.id,
        trackId: track.id,
        spotifyTrackId: track.spotifyTrackId,
        score,
      },
      'Queue entry created.',
    );

    return this.toDto(entry, {
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
    });
  }

  async listSession(sessionId: string, guestId: string): Promise<QueueEntryDto[]> {
    await this.sessions.loadJoinable(sessionId);
    await this.moderation.assertGuestCanReadQueue(sessionId, guestId);
    const rows = await this.entries.listBySessionWithTrack(sessionId);
    return rows.map((row) => this.toDtoFromWithTrack(row));
  }

  // Host-facing queue read. Verifies session ownership and bypasses guest
  // moderation gates so the host dashboard can render queue state regardless
  // of guest discipline. Used by GET /sessions/:id/host/queue.
  async listSessionForHost(sessionId: string, hostUserId: string): Promise<QueueEntryDto[]> {
    await this.sessions.getSession(sessionId, hostUserId);
    const rows = await this.entries.listBySessionWithTrack(sessionId);
    return rows.map((row) => this.toDtoFromWithTrack(row));
  }

  async removeOwnEntry(entryId: string, guestId: string): Promise<QueueEntryDto> {
    const entry = await this.entries.findByIdWithTrack(entryId);
    if (!entry) {
      throw new DomainError('NOT_FOUND', 'Queue entry not found.');
    }
    if (entry.addedByGuestId !== guestId) {
      throw new DomainError('FORBIDDEN', 'You can only remove your own queue entries.');
    }
    await this.moderation.assertGuestCanMutateQueue(entry.sessionId, guestId, 'queue_remove');
    if (entry.status !== 'PENDING') {
      // Once an entry is LOCKED or further along, removal becomes a host
      // moderation action (M14). Guests can only retract while still pending.
      throw new DomainError(
        'CONFLICT',
        'Only pending queue entries can be removed by the guest who added them.',
      );
    }

    const updated = await this.entries.markRemoved(entryId);
    await this.redisQueue.removeEntry(entry.sessionId, entryId);
    this.realtime?.publishQueueUpdated(entry.sessionId, {
      reason: 'entry_removed',
      entryId,
      status: updated.status,
    });
    this.logger.log(
      { sessionId: entry.sessionId, guestId, entryId },
      'Queue entry removed by adder.',
    );

    return this.toDto(updated, entry.track);
  }

  private async enforceMaxSuggestions(
    sessionId: string,
    guestId: string,
    maxSuggestions: number,
  ): Promise<void> {
    const active = await this.entries.countActiveByGuest(sessionId, guestId);
    if (active >= maxSuggestions) {
      throw new DomainError(
        'CONFLICT',
        `You have reached the per-guest suggestion limit (${maxSuggestions}).`,
        { activeCount: active, maxSuggestions },
      );
    }
  }

  private async enforceDuplicateCooldown(
    sessionId: string,
    trackId: string,
    cooldownSeconds: number,
  ): Promise<void> {
    const cutoff = new Date(Date.now() - cooldownSeconds * 1000);
    const recent = await this.entries.findRecentForTrack(sessionId, trackId, cutoff);
    if (recent) {
      throw new DomainError('CONFLICT', 'This track is already queued or was played recently.', {
        existingEntryId: recent.id,
        existingStatus: recent.status,
        cooldownSeconds,
      });
    }
  }

  private toDto(
    entry: QueueEntryRecord,
    track: TrackDto & { id: string; createdAt: Date },
  ): QueueEntryDto {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      trackId: entry.trackId,
      addedByGuestId: entry.addedByGuestId,
      status: entry.status,
      upvotes: entry.upvotes,
      downvotes: entry.downvotes,
      boostCredits: entry.boostCredits,
      score: entry.score,
      lockedUntil: entry.lockedUntil ? entry.lockedUntil.toISOString() : null,
      hostPinned: entry.hostPinned,
      spotifyQueuedAt: entry.spotifyQueuedAt ? entry.spotifyQueuedAt.toISOString() : null,
      playingAt: entry.playingAt ? entry.playingAt.toISOString() : null,
      playedAt: entry.playedAt ? entry.playedAt.toISOString() : null,
      removedAt: entry.removedAt ? entry.removedAt.toISOString() : null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      track: {
        spotifyUri: track.spotifyUri,
        spotifyTrackId: track.spotifyTrackId,
        title: track.title,
        artist: track.artist,
        ...(track.album ? { album: track.album } : {}),
        durationMs: track.durationMs,
        ...(track.artworkUrl ? { artworkUrl: track.artworkUrl } : {}),
        explicit: track.explicit,
      },
    };
  }

  private toDtoFromWithTrack(row: QueueEntryWithTrack): QueueEntryDto {
    return this.toDto(row, row.track);
  }
}
