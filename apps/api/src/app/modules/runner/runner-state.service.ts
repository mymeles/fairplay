import { Injectable, Logger, Optional } from '@nestjs/common';
import type {
  RunnerStatusChangedPayload,
  RunnerStatusReason,
  RunnerStatusState,
} from '@fairplay/shared-types';
import { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';

// Per-session runner state, in-memory. Tracks whether the host has paused the
// runner explicitly, the last dispatch outcome, and the next time a tick is
// allowed (after a 429 or breaker cooldown). Publishes runner.status_changed
// via the realtime layer only when the state *transitions* — duplicate ACTIVE
// events would be noise.

export interface SessionRunnerState {
  sessionId: string;
  enabled: boolean;
  status: RunnerStatusState;
  reason: RunnerStatusReason;
  retryAtMs: number | null;
  lastEntryId?: string;
  lastErrorCode?: string;
  updatedAtMs: number;
}

@Injectable()
export class RunnerStateService {
  private readonly logger = new Logger(RunnerStateService.name);
  private readonly states = new Map<string, SessionRunnerState>();

  constructor(@Optional() private readonly realtime?: RealtimeEventPublisher) {}

  snapshot(sessionId: string): SessionRunnerState {
    return (
      this.states.get(sessionId) ?? {
        sessionId,
        enabled: true,
        status: 'IDLE',
        reason: 'idle',
        retryAtMs: null,
        updatedAtMs: 0,
      }
    );
  }

  isEnabled(sessionId: string): boolean {
    return this.snapshot(sessionId).enabled;
  }

  isBackingOff(sessionId: string, now: Date = new Date()): boolean {
    const state = this.snapshot(sessionId);
    return state.retryAtMs !== null && state.retryAtMs > now.getTime();
  }

  // Caller invokes after a non-recoverable error (premium required, no
  // active device) — runner stays disabled until host intervention.
  disable(sessionId: string, reason: RunnerStatusReason, errorCode?: string): void {
    this.transition(sessionId, {
      enabled: false,
      status: 'DISABLED',
      reason,
      retryAtMs: null,
      lastErrorCode: errorCode,
    });
  }

  enable(sessionId: string): void {
    this.transition(sessionId, {
      enabled: true,
      status: 'IDLE',
      reason: 'started',
      retryAtMs: null,
    });
  }

  markActive(sessionId: string, entryId: string): void {
    this.transition(sessionId, {
      enabled: true,
      status: 'ACTIVE',
      reason: 'started',
      retryAtMs: null,
      lastEntryId: entryId,
    });
  }

  markFallbackActive(sessionId: string): void {
    this.transition(sessionId, {
      enabled: true,
      status: 'ACTIVE',
      reason: 'started',
      retryAtMs: null,
    });
  }

  markIdle(sessionId: string): void {
    const current = this.states.get(sessionId);
    // Avoid noisy idle-then-idle publishes if the runner just keeps ticking
    // with nothing to do.
    if (!current || current.status === 'IDLE') return;
    this.transition(sessionId, {
      enabled: current.enabled,
      status: 'IDLE',
      reason: 'idle',
      retryAtMs: null,
    });
  }

  // 429 / breaker open. Caller passes the absolute retry time so multiple
  // signals (Retry-After, breaker cooldown) converge cleanly.
  markBackingOff(
    sessionId: string,
    reason: RunnerStatusReason,
    retryAtMs: number,
    errorCode?: string,
  ): void {
    this.transition(sessionId, {
      enabled: true,
      status: 'BACKING_OFF',
      reason,
      retryAtMs,
      lastErrorCode: errorCode,
    });
  }

  // Called when the owning session ends so we stop ticking it and let the
  // realtime listeners see a final state.
  forgetSession(sessionId: string): void {
    if (!this.states.has(sessionId)) return;
    this.transition(sessionId, {
      enabled: false,
      status: 'DISABLED',
      reason: 'session_ended',
      retryAtMs: null,
    });
    this.states.delete(sessionId);
  }

  private transition(
    sessionId: string,
    next: Omit<SessionRunnerState, 'sessionId' | 'updatedAtMs'>,
  ): void {
    const previous = this.states.get(sessionId);
    const nextState: SessionRunnerState = {
      sessionId,
      updatedAtMs: Date.now(),
      ...next,
    };
    this.states.set(sessionId, nextState);

    if (
      previous &&
      previous.status === nextState.status &&
      previous.reason === nextState.reason &&
      previous.retryAtMs === nextState.retryAtMs &&
      previous.enabled === nextState.enabled
    ) {
      // Nothing materially changed — skip the publish.
      return;
    }

    const payload: RunnerStatusChangedPayload = {
      sessionId,
      state: nextState.status,
      reason: nextState.reason,
      retryAtMs: nextState.retryAtMs,
      ...(nextState.lastEntryId ? { lastEntryId: nextState.lastEntryId } : {}),
      ...(nextState.lastErrorCode ? { lastErrorCode: nextState.lastErrorCode } : {}),
    };

    this.realtime?.publishRunnerStatusChanged(sessionId, payload);
    this.logger.log(
      {
        sessionId,
        state: nextState.status,
        reason: nextState.reason,
        retryAtMs: nextState.retryAtMs,
        lastErrorCode: nextState.lastErrorCode,
      },
      'Runner state transition.',
    );
  }
}
