import type { GuestId, QueueEntryId, SessionId, TrackId } from './ids';
import type { TrackDto } from './tracks';

export type QueueEntryStatus =
  | 'PENDING'
  | 'LOCKED'
  | 'QUEUED_TO_SPOTIFY'
  | 'PLAYING'
  | 'PLAYED'
  | 'REMOVED'
  | 'VETOED';

export interface QueueEntryDto {
  id: QueueEntryId;
  sessionId: SessionId;
  trackId: TrackId;
  addedByGuestId: GuestId | null;
  addedByGuestDisplayName: string | null;
  status: QueueEntryStatus;
  upvotes: number;
  downvotes: number;
  boostCredits: number;
  score: number;
  lockedUntil: string | null;
  challengeHoldUntil: string | null;
  hostPinned: boolean;
  spotifyQueuedAt: string | null;
  playingAt: string | null;
  playedAt: string | null;
  removedAt: string | null;
  createdAt: string;
  updatedAt: string;
  track: TrackDto;
}
