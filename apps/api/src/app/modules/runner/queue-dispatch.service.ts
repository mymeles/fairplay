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
import { SpotifyTokenRefreshService } from '../spotify-playback/spotify-token-refresh.service';
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

export type DispatchOutcome =
  | 'dispatched'
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
    private readonly entries: QueueEntryRepository,
    private readonly redisQueue: RedisQueueRepository,
    private readonly tokenRefresh: SpotifyTokenRefreshService,
    private readonly spotifyQueue: SpotifyQueueAdapter,
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

    // 5. Find the highest-ranked PENDING entry via Redis, reconcile with DB.
    const candidate = await this.pickNextPending(sessionId);
    if (!candidate) {
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
      const fresh = await this.entries.findByIdWithTrack(candidate.id);
      if (!fresh || fresh.status !== 'PENDING') {
        // The world moved under us — let the next tick try again.
        this.runnerState.markIdle(sessionId);
        return { sessionId, outcome: 'no_pending' };
      }

      // 8. Refresh the host token (with one-shot 401 retry) and call Spotify.
      const accessToken = await this.tokenRefresh.getValidAccessToken(hostUserId);
      const deviceId = session.selectedSpotifyDeviceId;
      try {
        await this.spotifyQueue.enqueueTrack(accessToken, fresh.track.spotifyUri, deviceId);
      } catch (err) {
        // 401 — refresh once and retry. Same pattern as SpotifyDeviceService.
        if (err instanceof DomainError && err.code === 'SPOTIFY_AUTH_FAILED') {
          try {
            const fresher = await this.tokenRefresh.forceRefresh(hostUserId);
            await this.spotifyQueue.enqueueTrack(fresher, fresh.track.spotifyUri, deviceId);
          } catch (retryErr) {
            return this.handleSpotifyError(sessionId, hostUserId, fresh, retryErr, now);
          }
        } else {
          return this.handleSpotifyError(sessionId, hostUserId, fresh, err, now);
        }
      }

      // 9. Spotify accepted the track — mark the entry, drop from pending
      //    ZSET, publish realtime updates.
      const queuedAt = new Date();
      const updated = await this.entries.markQueuedToSpotify(fresh.id, queuedAt);
      await this.redisQueue.removeEntry(sessionId, updated.id);
      this.breaker.recordSuccess(hostUserId);
      this.runnerState.markActive(sessionId, updated.id);

      const payload: TrackQueuedToSpotifyPayload = {
        entryId: updated.id,
        trackUri: fresh.track.spotifyUri,
        spotifyQueuedAt: queuedAt.toISOString(),
      };
      this.realtime?.publishTrackQueuedToSpotify(sessionId, payload);
      this.realtime?.publishQueueUpdated(sessionId, {
        reason: 'entry_queued_to_spotify',
        entryId: updated.id,
        status: updated.status,
      });

      this.logger.log(
        {
          sessionId,
          hostUserId,
          entryId: updated.id,
          trackUri: fresh.track.spotifyUri,
          deviceId,
        },
        'Track dispatched to Spotify.',
      );

      return {
        sessionId,
        outcome: 'dispatched',
        entryId: updated.id,
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

  private async pickNextPending(sessionId: string): Promise<QueueEntryWithTrack | null> {
    // Try a few top entries from Redis — sometimes the head was just
    // removed/vetoed and the ZSET hasn't caught up. The repo helper drops
    // entries that aren't actually PENDING in Postgres.
    const TOP_K = 5;
    const candidateIds = await this.redisQueue.listTopPendingIds(sessionId, TOP_K);
    if (candidateIds.length === 0) return null;
    const rows = await this.entries.listPendingByIdsWithTrack(sessionId, candidateIds);
    return rows[0] ?? null;
  }

  private handleSpotifyError(
    sessionId: string,
    hostUserId: string,
    entry: QueueEntryWithTrack,
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
        default: {
          this.breaker.recordFailure(hostUserId, now);
          this.logger.warn(
            { sessionId, entryId: entry.id, code: err.code },
            'Spotify dispatch failed with domain error.',
          );
          return { sessionId, outcome: 'error', errorCode: err.code };
        }
      }
    }
    this.breaker.recordFailure(hostUserId, now);
    this.logger.warn({ sessionId, entryId: entry.id, err }, 'Spotify dispatch failed.');
    return {
      sessionId,
      outcome: 'error',
      errorCode: err instanceof Error ? err.message : 'unknown',
    };
  }
}
