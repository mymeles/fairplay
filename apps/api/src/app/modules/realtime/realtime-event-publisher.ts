import { Injectable, Logger } from '@nestjs/common';
import type {
  NowPlayingUpdatedPayload,
  QueueUpdatedPayload,
  RealtimeEventEnvelope,
  RealtimeEventType,
  RunnerStatusChangedPayload,
  TokenUpdatedPayload,
  TrackLockPayload,
  TrackQueuedToSpotifyPayload,
  VoteUpdatedPayload,
} from '@fairplay/shared-types';
import { PartyGateway } from './party.gateway';

@Injectable()
export class RealtimeEventPublisher {
  private readonly logger = new Logger(RealtimeEventPublisher.name);
  private readonly sequences = new Map<string, number>();

  constructor(private readonly gateway: PartyGateway) {}

  publishQueueUpdated(
    sessionId: string,
    payload: QueueUpdatedPayload,
  ): RealtimeEventEnvelope<QueueUpdatedPayload> {
    return this.publishToSession('queue.updated', sessionId, payload);
  }

  publishVoteUpdated(
    sessionId: string,
    payload: VoteUpdatedPayload,
  ): RealtimeEventEnvelope<VoteUpdatedPayload> {
    return this.publishToSession('vote.updated', sessionId, payload);
  }

  publishTrackLocked(
    sessionId: string,
    payload: TrackLockPayload,
  ): RealtimeEventEnvelope<TrackLockPayload> {
    return this.publishToSession('track.locked', sessionId, payload);
  }

  publishTrackUnlocked(
    sessionId: string,
    payload: TrackLockPayload,
  ): RealtimeEventEnvelope<TrackLockPayload> {
    return this.publishToSession('track.unlocked', sessionId, payload);
  }

  publishTokenUpdated(
    sessionId: string,
    guestId: string,
    payload: TokenUpdatedPayload,
  ): RealtimeEventEnvelope<TokenUpdatedPayload> {
    const event = this.createEvent('token.updated', sessionId, payload);
    this.gateway.emitToSession(event);
    this.gateway.emitToGuest(guestId, event);
    this.logger.log(
      { sessionId, guestId, type: event.type, sequence: event.sequence },
      'Realtime event published.',
    );
    return event;
  }

  publishSessionUpdated(sessionId: string, payload: unknown): RealtimeEventEnvelope<unknown> {
    return this.publishToSession('session.updated', sessionId, payload);
  }

  publishGuestJoined(sessionId: string, payload: unknown): RealtimeEventEnvelope<unknown> {
    return this.publishToSession('guest.joined', sessionId, payload);
  }

  publishTrackQueuedToSpotify(
    sessionId: string,
    payload: TrackQueuedToSpotifyPayload,
  ): RealtimeEventEnvelope<TrackQueuedToSpotifyPayload> {
    return this.publishToSession('track.queued_to_spotify', sessionId, payload);
  }

  publishNowPlayingUpdated(
    sessionId: string,
    payload: NowPlayingUpdatedPayload,
  ): RealtimeEventEnvelope<NowPlayingUpdatedPayload> {
    return this.publishToSession('now_playing.updated', sessionId, payload);
  }

  publishRunnerStatusChanged(
    sessionId: string,
    payload: RunnerStatusChangedPayload,
  ): RealtimeEventEnvelope<RunnerStatusChangedPayload> {
    return this.publishToSession('runner.status_changed', sessionId, payload);
  }

  publishSessionEnded(sessionId: string, payload: unknown): RealtimeEventEnvelope<unknown> {
    return this.publishToSession('session.ended', sessionId, payload);
  }

  private publishToSession<TPayload>(
    type: RealtimeEventType,
    sessionId: string,
    payload: TPayload,
  ): RealtimeEventEnvelope<TPayload> {
    const event = this.createEvent(type, sessionId, payload);
    this.gateway.emitToSession(event);
    this.logger.log(
      { sessionId, type: event.type, sequence: event.sequence },
      'Realtime event published.',
    );
    return event;
  }

  private createEvent<TPayload>(
    type: RealtimeEventType,
    sessionId: string,
    payload: TPayload,
  ): RealtimeEventEnvelope<TPayload> {
    return {
      type,
      sessionId,
      sequence: this.nextSequence(sessionId),
      emittedAt: new Date().toISOString(),
      payload,
    };
  }

  private nextSequence(sessionId: string): number {
    const next = (this.sequences.get(sessionId) ?? 0) + 1;
    this.sequences.set(sessionId, next);
    return next;
  }
}
