import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SCORING_WEIGHTS,
  type ScoringWeights,
  type SessionSettings,
} from '@fairplay/shared-types';

// Inputs that feed the scoring formula. Independent from QueueEntryRecord so
// the service stays usable from any caller — tests, the runner (M12), and
// future projection rebuilds (M11).
export interface ScoringInputs {
  upvotes: number;
  downvotes: number;
  boostCredits: number;
  hostPinned: boolean;
  createdAt: Date;
}

const MS_PER_MINUTE = 60_000;

@Injectable()
export class ScoringService {
  // Pure: no IO, no clock injection so the formula is trivially testable.
  // Callers that need a fixed `now` (rebuild jobs) pass it explicitly.
  calculate(
    inputs: ScoringInputs,
    settings: Pick<SessionSettings, 'scoring'>,
    now: Date = new Date(),
  ): number {
    const weights = withDefaults(settings.scoring);
    const minutesWaiting = Math.max(
      0,
      (now.getTime() - inputs.createdAt.getTime()) / MS_PER_MINUTE,
    );
    const score =
      weights.upvoteWeight * Math.log(1 + inputs.upvotes) -
      weights.downvoteWeight * inputs.downvotes +
      weights.boostWeight * inputs.boostCredits +
      weights.ageWeight * minutesWaiting +
      (inputs.hostPinned ? weights.hostPinWeight : 0);

    // Round to 6 decimal places so Decimal storage and Redis score precision
    // stay consistent; ZSETs use 64-bit floats which can drift.
    return Math.round(score * 1_000_000) / 1_000_000;
  }
}

const withDefaults = (partial: Partial<ScoringWeights> | undefined): ScoringWeights => ({
  ...DEFAULT_SCORING_WEIGHTS,
  ...(partial ?? {}),
});
