import { Injectable, Logger, Optional } from '@nestjs/common';
import type {
  NowPlayingState,
  NowPlayingUpdatedPayload,
} from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import { QueueEntryRepository } from '../queue/queue-entry.repository';
import { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import { SessionService } from '../sessions/session.service';
import {
  SpotifyPlaybackAdapter,
  type SpotifyPlaybackState,
} from '../spotify-playback/spotify-playback.adapter';
import { SpotifyTokenRefreshService } from '../spotify-playback/spotify-token-refresh.service';

// Outcome describes what the poll *did*. Used by tests + the poller to log
// summary stats and by future M14/M20 dashboards.
export type NowPlayingOutcome =
  | 'no_change'              // already aligned with Spotify
  | 'transitioned_playing'   // QUEUED_TO_SPOTIFY (or PENDING after manual play) → PLAYING
  | 'completed_previous'     // previous PLAYING marked PLAYED
  | 'external_track'         // Spotify is playing something not from our queue
  | 'paused'                 // Spotify is paused — clear PLAYING if we still have one
  | 'idle'                   // host has no active playback session
  | 'no_active_device'
  | 'host_disconnected'      // host removed the Spotify connection
  | 'spotify_unavailable'    // rate limited / 5xx — try again later
  | 'error';

export interface NowPlayingResult {
  sessionId: string;
  outcome: NowPlayingOutcome;
  trackUri: string | null;
  entryId: string | null;
}

@Injectable()
export class NowPlayingService {
  private readonly logger = new Logger(NowPlayingService.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly entries: QueueEntryRepository,
    private readonly tokenRefresh: SpotifyTokenRefreshService,
    private readonly playback: SpotifyPlaybackAdapter,
    @Optional() private readonly realtime?: RealtimeEventPublisher,
  ) {}

  async syncSession(sessionId: string): Promise<NowPlayingResult> {
    let session;
    try {
      session = await this.sessions.loadJoinable(sessionId);
    } catch {
      // ENDED / EXPIRED — nothing to sync.
      return this.noop(sessionId, 'idle');
    }

    let playback: SpotifyPlaybackState | null;
    try {
      const accessToken = await this.tokenRefresh.getValidAccessToken(session.hostUserId);
      try {
        playback = await this.playback.getPlaybackState(accessToken);
      } catch (err) {
        if (err instanceof DomainError && err.code === 'SPOTIFY_AUTH_FAILED') {
          // One-shot refresh + retry, same pattern as the runner and
          // SpotifyDeviceService.
          const fresher = await this.tokenRefresh.forceRefresh(session.hostUserId);
          playback = await this.playback.getPlaybackState(fresher);
        } else {
          throw err;
        }
      }
    } catch (err) {
      return this.handleAdapterError(sessionId, err);
    }

    if (playback === null) {
      // Spotify 204 — no active playback session at all.
      return await this.handleQuietState(session.id, 'no_active_device', null);
    }

    // Paused = Spotify knows the track but isn't advancing. Don't transition
    // out of PLAYING (it could resume) but report the state to listeners.
    if (!playback.isPlaying) {
      return await this.handleQuietState(
        session.id,
        'paused',
        playback,
      );
    }

    const currentlyPlayingUri = playback.trackUri;
    if (!currentlyPlayingUri) {
      // Active session but no track payload — treat as idle.
      return await this.handleQuietState(session.id, 'idle', playback);
    }

    return this.reconcile(session.id, currentlyPlayingUri, playback);
  }

  private async reconcile(
    sessionId: string,
    currentlyPlayingUri: string,
    playback: SpotifyPlaybackState,
  ): Promise<NowPlayingResult> {
    // Find the entry whose track matches Spotify's currently-playing.
    const matched = await this.entries.findBySessionAndTrackUriWithTrack(
      sessionId,
      currentlyPlayingUri,
      ['QUEUED_TO_SPOTIFY', 'PLAYING', 'PENDING', 'LOCKED'],
    );

    const previousPlaying = await this.entries.findPlayingBySession(sessionId);

    if (matched && matched.status === 'PLAYING') {
      // Already aligned — just publish a refresh so subscribers see new
      // progress. No DB write.
      return this.publish(
        sessionId,
        'no_change',
        'playing',
        currentlyPlayingUri,
        matched.id,
        true,
        playback,
      );
    }

    // If the previous PLAYING entry is no longer the current Spotify track
    // (or there's a different match), mark it PLAYED first so we never have
    // two PLAYING rows simultaneously.
    if (previousPlaying && (!matched || previousPlaying.id !== matched.id)) {
      await this.entries.markPlayed(previousPlaying.id);
      this.logger.log(
        {
          sessionId,
          entryId: previousPlaying.id,
          previousStatus: 'PLAYING',
        },
        'Previous PLAYING entry marked PLAYED.',
      );
    }

    if (!matched) {
      // External / manual track — host is playing something not from our
      // queue. Don't create a row; just tell listeners.
      return this.publish(
        sessionId,
        'external_track',
        'playing',
        currentlyPlayingUri,
        null,
        false,
        playback,
      );
    }

    // matched.status is one of QUEUED_TO_SPOTIFY / PENDING / LOCKED here.
    // PENDING/LOCKED can happen if the host played a track manually that the
    // queue still has scheduled — we promote it straight to PLAYING.
    const promoted = await this.entries.markPlaying(matched.id);
    this.logger.log(
      {
        sessionId,
        entryId: promoted.id,
        trackUri: currentlyPlayingUri,
        previousStatus: matched.status,
      },
      'Queue entry transitioned to PLAYING.',
    );

    const outcome: NowPlayingOutcome = previousPlaying
      ? 'completed_previous'
      : 'transitioned_playing';

    return this.publish(
      sessionId,
      outcome,
      'playing',
      currentlyPlayingUri,
      promoted.id,
      true,
      playback,
    );
  }

  private async handleQuietState(
    sessionId: string,
    nowState: NowPlayingState,
    playback: SpotifyPlaybackState | null,
  ): Promise<NowPlayingResult> {
    // When Spotify is paused / idle / has no device, keep the current
    // PLAYING entry intact (it may resume) but publish the state for UI.
    const previousPlaying = await this.entries.findPlayingBySession(sessionId);
    const outcome: NowPlayingOutcome =
      nowState === 'no_active_device'
        ? 'no_active_device'
        : nowState === 'paused'
          ? 'paused'
          : 'idle';

    return this.publish(
      sessionId,
      outcome,
      nowState,
      playback?.trackUri ?? null,
      previousPlaying?.id ?? null,
      Boolean(previousPlaying),
      playback,
    );
  }

  private handleAdapterError(sessionId: string, err: unknown): NowPlayingResult {
    if (err instanceof DomainError) {
      if (err.code === 'UNAUTHORIZED') {
        // Host has not connected Spotify (or disconnected) — nothing to do.
        return this.noop(sessionId, 'host_disconnected');
      }
      if (err.code === 'SPOTIFY_AUTH_FAILED') {
        // Refresh failed after retry — the host needs to reconnect; the
        // runner will surface premium / device errors. We just back off.
        return this.noop(sessionId, 'host_disconnected');
      }
      if (err.code === 'SPOTIFY_RATE_LIMITED' || err.code === 'EXTERNAL_DEPENDENCY_FAILED') {
        return this.noop(sessionId, 'spotify_unavailable');
      }
    }
    this.logger.warn({ err, sessionId }, 'Now-playing sync failed.');
    return this.noop(sessionId, 'error');
  }

  private publish(
    sessionId: string,
    outcome: NowPlayingOutcome,
    state: NowPlayingState,
    trackUri: string | null,
    entryId: string | null,
    isInternal: boolean,
    playback: SpotifyPlaybackState | null,
  ): NowPlayingResult {
    const payload: NowPlayingUpdatedPayload = {
      sessionId,
      state,
      trackUri,
      entryId,
      isInternal,
      progressMs: playback?.progressMs ?? null,
      deviceId: playback?.device?.id ?? null,
    };
    this.realtime?.publishNowPlayingUpdated(sessionId, payload);
    return { sessionId, outcome, trackUri, entryId };
  }

  private noop(sessionId: string, outcome: NowPlayingOutcome): NowPlayingResult {
    return { sessionId, outcome, trackUri: null, entryId: null };
  }
}
