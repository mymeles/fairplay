import type { GuestId, QueueEntryId, SessionId } from './ids';
import type { QueueEntryStatus } from './queue';

export type RealtimeEventType =
  | 'session.updated'
  | 'guest.joined'
  | 'queue.updated'
  | 'vote.updated'
  | 'track.locked'
  | 'track.unlocked'
  | 'token.updated'
  | 'track.queued_to_spotify'
  | 'now_playing.updated'
  | 'runner.status_changed'
  | 'session.ended';

export interface RealtimeEventEnvelope<TPayload = unknown> {
  type: RealtimeEventType;
  sessionId: SessionId;
  sequence: number;
  emittedAt: string;
  payload: TPayload;
}

export interface QueueUpdatedPayload {
  reason:
    | 'entry_added'
    | 'entry_removed'
    | 'entry_vetoed'
    | 'score_changed'
    | 'lock_changed'
    | 'entry_queued_to_spotify'
    | 'boost_applied'
    | 'host_pinned'
    | 'host_unpinned';
  entryId?: QueueEntryId;
  status?: QueueEntryStatus;
}

export interface VoteUpdatedPayload {
  entryId: QueueEntryId;
  guestId: GuestId;
  value: 1 | -1 | null;
  upvotes: number;
  downvotes: number;
  score: number;
  status: QueueEntryStatus;
}

export interface TrackLockPayload {
  entryId: QueueEntryId;
  status: Extract<QueueEntryStatus, 'PENDING' | 'LOCKED'>;
  lockedUntil: string | null;
  reason: 'window_locked' | 'window_expired' | 'challenge';
}

export interface TokenUpdatedPayload {
  guestId: GuestId;
  tokenType: 'BOOST' | 'CHALLENGE' | 'WALLET';
  boostTokens: number;
  challengeTokens: number;
  reason: 'challenge_lock' | 'boost_applied' | 'host_grant';
}

// M12 — runner publishes this when an internal queue entry is dispatched to
// the host's Spotify queue. UIs use it to show "queued in Spotify" state and
// to refresh display ordering after the entry leaves the pending ZSET.
export interface TrackQueuedToSpotifyPayload {
  entryId: QueueEntryId;
  trackUri: string;
  spotifyQueuedAt: string;
}

// M12 — runner health / capability changes for a session. `state` is the
// circuit-breaker / disabled-by-error state, `reason` is a short tag suitable
// for surfacing to the host UI.
export type RunnerStatusState = 'ACTIVE' | 'IDLE' | 'BACKING_OFF' | 'DISABLED';

export type RunnerStatusReason =
  | 'started'
  | 'idle'
  | 'rate_limited'
  | 'circuit_open'
  | 'circuit_closed'
  | 'premium_required'
  | 'no_active_device'
  | 'auth_failed'
  | 'host_disabled'
  | 'session_ended';

export interface RunnerStatusChangedPayload {
  sessionId: SessionId;
  state: RunnerStatusState;
  reason: RunnerStatusReason;
  retryAtMs: number | null;
  lastEntryId?: QueueEntryId;
  lastErrorCode?: string;
}

// M13 — now-playing sync publishes this whenever the playback state changes
// in a way the UI should reflect. `state` describes Spotify's state for the
// host's account; `entryId` is the FairPlay queue entry currently mapped to
// Spotify's currently-playing track (null when an external track is playing
// or there is nothing to map).
export type NowPlayingState = 'playing' | 'paused' | 'idle' | 'no_active_device';

export interface NowPlayingUpdatedPayload {
  sessionId: SessionId;
  state: NowPlayingState;
  trackUri: string | null;
  entryId: QueueEntryId | null;
  isInternal: boolean;
  progressMs: number | null;
  deviceId: string | null;
}
