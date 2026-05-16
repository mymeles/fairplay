import {
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_SESSION_SETTINGS,
  type SessionSettings,
} from '@fairplay/shared-types';
import { ScoringService } from './scoring.service';

const NOW = new Date('2026-05-15T12:00:00Z');
const FIVE_MIN_AGO = new Date(NOW.getTime() - 5 * 60_000);
const ONE_HOUR_AGO = new Date(NOW.getTime() - 60 * 60_000);

const baseSettings: SessionSettings = { ...DEFAULT_SESSION_SETTINGS };

const inputs = (overrides: Partial<{
  upvotes: number;
  downvotes: number;
  boostCredits: number;
  hostPinned: boolean;
  createdAt: Date;
}> = {}) => ({
  upvotes: 0,
  downvotes: 0,
  boostCredits: 0,
  hostPinned: false,
  createdAt: NOW,
  ...overrides,
});

describe('ScoringService.calculate', () => {
  const service = new ScoringService();

  it('returns 0 for a brand-new entry with no votes/boosts/age', () => {
    expect(service.calculate(inputs(), baseSettings, NOW)).toBe(0);
  });

  it('upvotes raise the score via log(1+upvotes)', () => {
    const score = service.calculate(inputs({ upvotes: 1 }), baseSettings, NOW);
    // 2 * log(2) ≈ 1.3862944
    expect(score).toBeCloseTo(2 * Math.log(2), 6);
  });

  it('downvotes lower the score linearly', () => {
    const score = service.calculate(inputs({ downvotes: 3 }), baseSettings, NOW);
    expect(score).toBe(-3);
  });

  it('upvotes outrank a small number of downvotes via log dampening', () => {
    // 5 upvotes vs 2 downvotes should still be net positive
    const score = service.calculate(
      inputs({ upvotes: 5, downvotes: 2 }),
      baseSettings,
      NOW,
    );
    expect(score).toBeGreaterThan(0);
  });

  it('a boost credit dominates a single downvote', () => {
    const noBoost = service.calculate(inputs({ downvotes: 1 }), baseSettings, NOW);
    const withBoost = service.calculate(
      inputs({ downvotes: 1, boostCredits: 1 }),
      baseSettings,
      NOW,
    );
    expect(withBoost - noBoost).toBeCloseTo(DEFAULT_SCORING_WEIGHTS.boostWeight, 6);
  });

  it('aging adds ageWeight * minutesWaiting', () => {
    const score = service.calculate(
      inputs({ createdAt: FIVE_MIN_AGO }),
      baseSettings,
      NOW,
    );
    // 0.05 * 5 = 0.25
    expect(score).toBeCloseTo(0.25, 6);
  });

  it('aging stacks linearly across long waits', () => {
    const short = service.calculate(inputs({ createdAt: FIVE_MIN_AGO }), baseSettings, NOW);
    const long = service.calculate(inputs({ createdAt: ONE_HOUR_AGO }), baseSettings, NOW);
    // 60 / 5 = 12x more aging contribution
    expect(long).toBeCloseTo(short * 12, 5);
  });

  it('host pin dominates everything else', () => {
    const ordinary = service.calculate(
      inputs({ upvotes: 100, downvotes: 0, boostCredits: 10, createdAt: ONE_HOUR_AGO }),
      baseSettings,
      NOW,
    );
    const pinned = service.calculate(inputs({ hostPinned: true }), baseSettings, NOW);
    expect(pinned).toBeGreaterThan(ordinary);
    expect(pinned).toBe(DEFAULT_SCORING_WEIGHTS.hostPinWeight);
  });

  it('per-session weight overrides take effect', () => {
    const aggressiveDownvotes: SessionSettings = {
      ...baseSettings,
      scoring: { ...DEFAULT_SCORING_WEIGHTS, downvoteWeight: 10 },
    };
    const score = service.calculate(
      inputs({ downvotes: 2 }),
      aggressiveDownvotes,
      NOW,
    );
    expect(score).toBe(-20);
  });

  it('missing scoring block falls back to defaults', () => {
    // Simulates an old session row whose settings_json predates M09. The
    // SessionRepository coalesces, but the service should also be defensive.
    const partial = { ...baseSettings, scoring: undefined as unknown as SessionSettings['scoring'] };
    expect(service.calculate(inputs({ upvotes: 1 }), partial, NOW)).toBeCloseTo(
      2 * Math.log(2),
      6,
    );
  });

  it('clamps a clock-skew negative age to zero', () => {
    // createdAt is in the future relative to `now` — should not yield negative aging.
    const future = new Date(NOW.getTime() + 60_000);
    const score = service.calculate(inputs({ createdAt: future }), baseSettings, NOW);
    expect(score).toBe(0);
  });
});
