import { Injectable, Logger } from '@nestjs/common';

// In-memory per-host circuit breaker for Spotify Web API calls. Keeps the
// runner from hammering a host's token when Spotify is angry (rate limit,
// outage, repeated 5xx). Scoped per-host because Spotify's quotas apply per
// (app, user) pair, not per session.
//
// State machine:
//   CLOSED       — normal. Failures increment a counter.
//   OPEN         — too many failures. canDispatch() returns false until
//                  `retryAtMs` passes. Then we move to HALF_OPEN.
//   HALF_OPEN    — let exactly one probe through. Success → CLOSED.
//                  Failure → OPEN with a longer cooldown.

export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BreakerSnapshot {
  state: BreakerState;
  retryAtMs: number | null;
  consecutiveFailures: number;
}

interface BreakerEntry {
  state: BreakerState;
  retryAtMs: number | null;
  consecutiveFailures: number;
}

const FAILURE_THRESHOLD = 3;
const BASE_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 5 * 60_000;

@Injectable()
export class SpotifyCircuitBreaker {
  private readonly logger = new Logger(SpotifyCircuitBreaker.name);
  private readonly state = new Map<string, BreakerEntry>();

  snapshot(hostUserId: string): BreakerSnapshot {
    const entry = this.state.get(hostUserId);
    if (!entry) return { state: 'CLOSED', retryAtMs: null, consecutiveFailures: 0 };
    return {
      state: entry.state,
      retryAtMs: entry.retryAtMs,
      consecutiveFailures: entry.consecutiveFailures,
    };
  }

  canDispatch(hostUserId: string, now: Date = new Date()): boolean {
    const entry = this.state.get(hostUserId);
    if (!entry) return true;
    if (entry.state === 'CLOSED') return true;
    if (entry.retryAtMs !== null && now.getTime() >= entry.retryAtMs) {
      // Cooldown elapsed — promote to HALF_OPEN and let one probe through.
      entry.state = 'HALF_OPEN';
      entry.retryAtMs = null;
      return true;
    }
    return entry.state === 'HALF_OPEN' ? true : false;
  }

  recordSuccess(hostUserId: string): void {
    const entry = this.state.get(hostUserId);
    if (!entry) return;
    if (entry.state !== 'CLOSED') {
      this.logger.log({ hostUserId, previous: entry.state }, 'Spotify breaker closed.');
    }
    this.state.delete(hostUserId);
  }

  // Generic failure — bumps the counter; trips when threshold hits.
  recordFailure(hostUserId: string, now: Date = new Date()): BreakerSnapshot {
    const entry = this.ensure(hostUserId);
    entry.consecutiveFailures += 1;
    if (entry.consecutiveFailures >= FAILURE_THRESHOLD) {
      const cooldown = Math.min(
        BASE_COOLDOWN_MS * Math.pow(2, entry.consecutiveFailures - FAILURE_THRESHOLD),
        MAX_COOLDOWN_MS,
      );
      entry.state = 'OPEN';
      entry.retryAtMs = now.getTime() + cooldown;
      this.logger.warn(
        { hostUserId, failures: entry.consecutiveFailures, cooldownMs: cooldown },
        'Spotify breaker opened.',
      );
    }
    return this.snapshot(hostUserId);
  }

  // 429 with Retry-After is authoritative — open exactly until then. This
  // overrides the generic failure counter so we don't extend the backoff.
  recordRetryAfter(
    hostUserId: string,
    retryAfterSec: number,
    now: Date = new Date(),
  ): BreakerSnapshot {
    const entry = this.ensure(hostUserId);
    entry.state = 'OPEN';
    entry.consecutiveFailures = Math.max(entry.consecutiveFailures, FAILURE_THRESHOLD);
    entry.retryAtMs = now.getTime() + Math.max(retryAfterSec, 1) * 1000;
    this.logger.warn({ hostUserId, retryAfterSec }, 'Spotify breaker honoring Retry-After.');
    return this.snapshot(hostUserId);
  }

  // Used by the dispatch service when a non-retryable failure (premium
  // required, no active device) means the runner can't continue without host
  // intervention — caller publishes a status_changed and disables the runner.
  forceOpen(hostUserId: string, cooldownMs: number, now: Date = new Date()): BreakerSnapshot {
    const entry = this.ensure(hostUserId);
    entry.state = 'OPEN';
    entry.consecutiveFailures = Math.max(entry.consecutiveFailures, FAILURE_THRESHOLD);
    entry.retryAtMs = now.getTime() + cooldownMs;
    return this.snapshot(hostUserId);
  }

  private ensure(hostUserId: string): BreakerEntry {
    let entry = this.state.get(hostUserId);
    if (!entry) {
      entry = { state: 'CLOSED', retryAtMs: null, consecutiveFailures: 0 };
      this.state.set(hostUserId, entry);
    }
    return entry;
  }
}
