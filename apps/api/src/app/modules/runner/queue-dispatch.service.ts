import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { TrackQueuedToSpotifyPayload } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import {
  QueueEntryRepository,
  type QueueEntryWithTrack,
} from '../queue/queue-entry.repository';
import { RedisQueueRepository } from '../queue/redis-queue.repository';
import { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import { SessionService } from '../sessions/session.service';
import { UserRepository } from '../spotify-auth/user.repository';
import { SpotifyPlaybackAdapter } from '../spotify-playback/spotify-playback.adapter';
import { SpotifyTokenRefreshService } from '../spotify-playback/spotify-token-refresh.service';
import { FallbackPlaylistService } from '../fallback-playlist/fallback-playlist.service';
import { RunnerStateService } from './runner-state.service';
import { SpotifyCircuitBreaker } from './spotify-circuit-breaker';
import { SpotifyQueueAdapter } from './spotify-queue.adapter';

// How long the per-session Redis dispatch lock survives if the holding tick
// crashes mid-flight. Comfortably longer than the slowest Spotify response
// we're willing to wait for; shorter than the runner tick so a crashed
// worker doesn't pin the lock for a whole tick interval.
const DISPATCH_LOCK_TTL_SECONDS = 15;

// Pacing floor when Spotify is healthy but we don't want to fire repeated
// 429-bait requests on a tight loop. After a 429 the breaker owns pacing.
const SOFT_RETRY_AFTER_MS = 2_000;
const DISPATCHABLE_STATUSES = new Set(['PENDING', 'LOCKED']);

export type DispatchOutcome =
  | 'dispatched'
  | 'fallback_dispatched'
  | 'no_pending'
  | 'buffer_full'
  | 'locked'
  | 'session_invalid'
  | 'runner_disabled'
  | 'circuit_open'
  | 'no_device'
  | 'premium_required'
  | 'auth_failed'
  | 'rate_limited'
  | 'error';

export interface DispatchResult {
  sessionId: string;
  outcome: DispatchOutcome;
  entryId?: string;
  trackUri?: string;
  retryAtMs?: number;
  errorCode?: string;
}

@Injectable()
export class QueueDispatchService {
  private readonly logger = new Logger(QueueDispatchService.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly users: UserRepository,
    private readonly entries: QueueEntryRepository,
    private readonly redisQueue: RedisQueueRepository,
    private readonly tokenRefresh: SpotifyTokenRefreshService,
    private readonly spotifyQueue: SpotifyQueueAdapter,
    private readonly spotifyPlayback: SpotifyPlaybackAdapter,
    private readonly fallbackPlaylist: FallbackPlaylistService,
    private readonly breaker: SpotifyCircuitBreaker,
    private readonly runnerState: RunnerStateService,
    @Optional() private readonly realtime?: RealtimeEventPublisher,
  ) {}

  async dispatchNextForSession(
    sessionId: string,
    now: Date = new Date(),
  ): Promise<DispatchResult> {
    // 1. Session must be ACTIVE / joinable.
    let session;
    try {
      session = await this.sessions.loadJoinable(sessionId);
    } catch (err) {
      // ENDED / EXPIRED — make sure we stop ticking this session and
      // realtime listeners see a clean final state.
      this.runnerState.forgetSession(sessionId);
      this.logger.warn({ err, sessionId }, 'Skipping dispatch: session not joinable.');
      return { sessionId, outcome: 'session_invalid' };
    }

    // 2. Runner must be enabled for this session.
    if (!this.runnerState.isEnabled(sessionId)) {
      return { sessionId, outcome: 'runner_disabled' };
    }

    // 3. Honor any active backoff (429, breaker open).
    if (this.runnerState.isBackingOff(sessionId, now)) {
      const snap = this.runnerState.snapshot(sessionId);
      return {
        sessionId,
        outcome: 'rate_limited',
        ...(snap.retryAtMs ? { retryAtMs: snap.retryAtMs } : {}),
      };
    }

    const hostUserId = session.hostUserId;
    if (!this.breaker.canDispatch(hostUserId, now)) {
      const snap = this.breaker.snapshot(hostUserId);
      const retryAtMs = snap.retryAtMs ?? now.getTime() + SOFT_RETRY_AFTER_MS;
      this.runnerState.markBackingOff(sessionId, 'circuit_open', retryAtMs);
      return { sessionId, outcome: 'circuit_open', retryAtMs };
    }

    // 4. Spotify buffer depth — never push past the session's configured
    //    target. Counted from our own DB; M13 will move QUEUED_TO_SPOTIFY
    //    rows to PLAYING once they actually start.
    const buffered = await this.entries.countSpotifyBufferedBySession(sessionId);
    if (buffered >= session.settings.spotifyQueueDepthTarget) {
      this.runnerState.markIdle(sessionId);
      return { sessionId, outcome: 'buffer_full' };
    }

    // 5. Find the next dispatchable entry. Locked rows are preferred: the
    // lock window is the final guest-visible grace period before Spotify.
    const candidate = await this.pickNextDispatchCandidate(sessionId, now);
    const fallbackCandidate = candidate
      ? null
      : await this.fallbackPlaylist.pickNextForRunner(sessionId, now);
    if (!candidate && !fallbackCandidate) {
      this.runnerState.markIdle(sessionId);
      return { sessionId, outcome: 'no_pending' };
    }

    // 6. Acquire dispatch lock so a concurrent tick / process can't
    //    double-dispatch the same entry.
    const lockToken = randomUUID();
    const gotLock = await this.redisQueue.acquireDispatchLock(
      sessionId,
      lockToken,
      DISPATCH_LOCK_TTL_SECONDS,
    );
    if (!gotLock) {
      return { sessionId, outcome: 'error', errorCode: 'lock_contention' };
    }

    try {
      // 7. Re-read the entry inside the lock window so we don't race a
      //    veto / removal that happened between picking and dispatching.
      if (!candidate && fallbackCandidate) {
        const accessToken = await this.tokenRefresh.getValidAccessToken(hostUserId);
        const deviceId = await this.selectedDeviceIdFor(hostUserId, session.selectedSpotifyDeviceId);
        const queuedAt = new Date();
        await this.fallbackPlaylist.markQueued(fallbackCandidate.id, queuedAt);
        try {
          await this.enqueueWithDeviceRecovery(
            accessToken,
            fallbackCandidate.track.spotifyUri,
            deviceId,
          );
        } catch (err) {
          if (err instanceof DomainError && err.code === 'SPOTIFY_AUTH_FAILED') {
            try {
              const fresher = await this.tokenRefresh.forceRefresh(hostUserId);
              await this.enqueueWithDeviceRecovery(
                fresher,
                fallbackCandidate.track.spotifyUri,
                deviceId,
              );
            } catch (retryErr) {
              return this.handleSpotifyError(sessionId, hostUserId, null, retryErr, now);
            }
          } else {
            return this.handleSpotifyError(sessionId, hostUserId, null, err, now);
          }
        }

        this.breaker.recordSuccess(hostUserId);
        this.runnerState.markFallbackActive(sessionId);
        this.logger.log(
          {
            sessionId,
            hostUserId,
            fallbackTrackId: fallbackCandidate.id,
            trackUri: fallbackCandidate.track.spotifyUri,
            deviceId,
          },
          'Fallback track dispatched to Spotify.',
        );
        return {
          sessionId,
          outcome: 'fallback_dispatched',
          trackUri: fallbackCandidate.track.spotifyUri,
        };
      }

      const fresh = await this.entries.findByIdWithTrack(candidate!.id);
      if (!fresh || !DISPATCHABLE_STATUSES.has(fresh.status)) {
        // The world moved under us — let the next tick try again.
        this.runnerState.markIdle(sessionId);
        return { sessionId, outcome: 'no_pending' };
      }
      // 8. Refresh the host token, then pre-claim the row immediately before
      //    calling Spotify. Token/device lookup failures have no Spotify side
      //    effects, so they should not move queue state.
      const accessToken = await this.tokenRefresh.getValidAccessToken(hostUserId);
      const deviceId = await this.selectedDeviceIdFor(hostUserId, session.selectedSpotifyDeviceId);
      const previousStatus = fresh.status as 'PENDING' | 'LOCKED';
      const queuedAt = new Date();
      const claimed = await this.entries.claimQueuedToSpotify(fresh.id, queuedAt);
      if (!claimed) {
        this.runnerState.markIdle(sessionId);
        return { sessionId, outcome: 'no_pending' };
      }

      try {
        await this.enqueueWithDeviceRecovery(accessToken, fresh.track.spotifyUri, deviceId);
      } catch (err) {
        // 401 — refresh once and retry. Same pattern as SpotifyDeviceService.
        if (err instanceof DomainError && err.code === 'SPOTIFY_AUTH_FAILED') {
          try {
            const fresher = await this.tokenRefresh.forceRefresh(hostUserId);
            await this.enqueueWithDeviceRecovery(fresher, fresh.track.spotifyUri, deviceId);
          } catch (retryErr) {
            await this.entries.restoreDispatchableStatus(fresh.id, previousStatus);
            return this.handleSpotifyError(sessionId, hostUserId, fresh, retryErr, now);
          }
        } else {
          await this.entries.restoreDispatchableStatus(fresh.id, previousStatus);
          return this.handleSpotifyError(sessionId, hostUserId, fresh, err, now);
        }
      }

      // 9. Spotify accepted the track — drop from pending ZSET and publish
      //    realtime updates. The DB row was pre-claimed before the external
      //    call so retrying ticks cannot enqueue the same entry twice.
      await this.redisQueue.removeEntry(sessionId, claimed.id);
      await this.redisQueue.removeLocked(sessionId, claimed.id);
      this.breaker.recordSuccess(hostUserId);
      this.runnerState.markActive(sessionId, claimed.id);

      const payload: TrackQueuedToSpotifyPayload = {
        entryId: claimed.id,
        trackUri: fresh.track.spotifyUri,
        spotifyQueuedAt: queuedAt.toISOString(),
      };
      this.realtime?.publishTrackQueuedToSpotify(sessionId, payload);
      this.realtime?.publishQueueUpdated(sessionId, {
        reason: 'entry_queued_to_spotify',
        entryId: claimed.id,
        status: claimed.status,
      });

      this.logger.log(
        {
          sessionId,
          hostUserId,
          entryId: claimed.id,
          trackUri: fresh.track.spotifyUri,
          deviceId,
        },
        'Track dispatched to Spotify.',
      );

      return {
        sessionId,
        outcome: 'dispatched',
        entryId: claimed.id,
        trackUri: fresh.track.spotifyUri,
      };
    } catch (err) {
      this.logger.warn({ err, sessionId }, 'Unexpected dispatch error.');
      this.breaker.recordFailure(hostUserId, now);
      return {
        sessionId,
        outcome: 'error',
        errorCode: err instanceof Error ? err.message : 'unknown',
      };
    } finally {
      await this.redisQueue.releaseDispatchLock(sessionId, lockToken);
    }
  }

  private async pickNextDispatchCandidate(
    sessionId: string,
    now: Date,
  ): Promise<QueueEntryWithTrack | null> {
    const locked = await this.entries.listLockedForDispatchWithTrack(sessionId, 1, now);
    if (locked[0]) return locked[0];

    // Try a few top entries from Redis — sometimes the head was just
    // removed/vetoed and the ZSET hasn't caught up. The repo helper drops
    // entries that aren't actually PENDING in Postgres.
    const TOP_K = 5;
    const candidateIds = await this.redisQueue.listTopPendingIds(sessionId, TOP_K);
    if (candidateIds.length === 0) return null;
    const rows = await this.entries.listPendingByIdsWithTrack(sessionId, candidateIds);
    return rows[0] ?? null;
  }

  private async enqueueWithDeviceRecovery(
    accessToken: string,
    trackUri: string,
    deviceId: string | null,
  ): Promise<void> {
    try {
      await this.spotifyQueue.enqueueTrack(accessToken, trackUri, deviceId);
      return;
    } catch (err) {
      if (!(err instanceof DomainError) || err.code !== 'SPOTIFY_NO_ACTIVE_DEVICE' || !deviceId) {
        throw err;
      }
    }

    try {
      await this.spotifyPlayback.transferPlayback(accessToken, deviceId, true);
    } catch (err) {
      if (err instanceof DomainError && err.code === 'SPOTIFY_DEVICE_NOT_FOUND') {
        await this.spotifyQueue.enqueueTrack(accessToken, trackUri, null);
        return;
      }
      throw err;
    }

    try {
      await this.spotifyQueue.enqueueTrack(accessToken, trackUri, deviceId);
    } catch (err) {
      if (err instanceof DomainError && err.code === 'SPOTIFY_DEVICE_NOT_FOUND') {
        await this.spotifyQueue.enqueueTrack(accessToken, trackUri, null);
        return;
      }
      throw err;
    }
  }

  private async selectedDeviceIdFor(
    hostUserId: string,
    sessionDeviceId: string | null,
  ): Promise<string | null> {
    const user = await this.users.findById(hostUserId);
    return user?.selectedDeviceId ?? sessionDeviceId;
  }

  private handleSpotifyError(
    sessionId: string,
    hostUserId: string,
    entry: QueueEntryWithTrack | null,
    err: unknown,
    now: Date,
  ): DispatchResult {
    if (err instanceof DomainError) {
      switch (err.code) {
        case 'SPOTIFY_RATE_LIMITED': {
          const retryAfterSec =
            typeof err.details.retryAfterSec === 'number' ? err.details.retryAfterSec : 30;
          this.breaker.recordRetryAfter(hostUserId, retryAfterSec, now);
          const retryAtMs = now.getTime() + retryAfterSec * 1000;
          this.runnerState.markBackingOff(sessionId, 'rate_limited', retryAtMs, err.code);
          return { sessionId, outcome: 'rate_limited', retryAtMs, errorCode: err.code };
        }
        case 'SPOTIFY_AUTH_FAILED': {
          // Already retried once above — give up for now, host needs to
          // reconnect.
          this.runnerState.disable(sessionId, 'auth_failed', err.code);
          this.breaker.forceOpen(hostUserId, 5 * 60_000, now);
          return { sessionId, outcome: 'auth_failed', errorCode: err.code };
        }
        case 'SPOTIFY_PREMIUM_REQUIRED': {
          this.runnerState.disable(sessionId, 'premium_required', err.code);
          this.breaker.forceOpen(hostUserId, 60 * 60_000, now);
          return { sessionId, outcome: 'premium_required', errorCode: err.code };
        }
        case 'SPOTIFY_NO_ACTIVE_DEVICE': {
          this.runnerState.disable(sessionId, 'no_active_device', err.code);
          this.breaker.forceOpen(hostUserId, 60_000, now);
          return { sessionId, outcome: 'no_device', errorCode: err.code };
        }
        case 'SPOTIFY_DEVICE_NOT_FOUND': {
          this.runnerState.disable(sessionId, 'no_active_device', err.code);
          this.breaker.forceOpen(hostUserId, 60_000, now);
          return { sessionId, outcome: 'no_device', errorCode: err.code };
        }
        default: {
          this.breaker.recordFailure(hostUserId, now);
          this.logger.warn(
            { sessionId, entryId: entry?.id ?? null, code: err.code },
            'Spotify dispatch failed with domain error.',
          );
          return { sessionId, outcome: 'error', errorCode: err.code };
        }
      }
    }
    this.breaker.recordFailure(hostUserId, now);
    this.logger.warn({ sessionId, entryId: entry?.id ?? null, err }, 'Spotify dispatch failed.');
    return {
      sessionId,
      outcome: 'error',
      errorCode: err instanceof Error ? err.message : 'unknown',
    };
  }
}
