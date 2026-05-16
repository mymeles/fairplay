import { Injectable } from '@nestjs/common';
import type { JoinTrustReason, ProximityResult } from '@fairplay/shared-types';

// Weights pinned by 03_milestones/MILESTONE_05_PROXIMITY_GATE.md.
// Tune carefully — the wallet/abuse logic in M15/M16 reads `score`.
export const TRUST_SIGNAL_WEIGHTS = {
  qrTokenValid: 40,
  joinCodeValid: 25,
  gpsWithinRadius: 25,
  wifiHashMatch: 30,
  lowRiskDevice: 10,
} as const;

export const MINIMUM_REQUIRED_SCORE = 50;

export interface TrustSignals {
  qrTokenValid: boolean;
  joinCodeValid: boolean;
  gpsWithinRadius: boolean;
  wifiHashMatch: boolean;
  lowRiskDevice: boolean;
  // Diagnostic-only context fields — used by the service to fill in
  // additional reasons (e.g. "guest sent GPS but session has no venue") so
  // logs explain why a signal was not evaluated.
  qrTokenProvided?: boolean;
  joinCodeProvided?: boolean;
  gpsProvided?: boolean;
  wifiHashProvided?: boolean;
  venueHasGps?: boolean;
  venueHasWifi?: boolean;
  distanceMeters?: number | null;
}

@Injectable()
export class JoinTrustScorer {
  readonly threshold = MINIMUM_REQUIRED_SCORE;

  score(signals: TrustSignals): ProximityResult {
    let score = 0;
    const reasons: JoinTrustReason[] = [];

    if (signals.qrTokenValid) {
      score += TRUST_SIGNAL_WEIGHTS.qrTokenValid;
      reasons.push('qrTokenValid');
    } else if (signals.qrTokenProvided) {
      reasons.push('qrTokenInvalid');
    }

    if (signals.joinCodeValid) {
      score += TRUST_SIGNAL_WEIGHTS.joinCodeValid;
      reasons.push('joinCodeValid');
    } else if (signals.joinCodeProvided) {
      reasons.push('joinCodeInvalid');
    }

    if (signals.gpsWithinRadius) {
      score += TRUST_SIGNAL_WEIGHTS.gpsWithinRadius;
      reasons.push('gpsWithinRadius');
    } else if (!signals.venueHasGps) {
      reasons.push('noVenueGps');
    } else if (!signals.gpsProvided) {
      reasons.push('gpsMissing');
    } else {
      reasons.push('gpsOutsideRadius');
    }

    if (signals.wifiHashMatch) {
      score += TRUST_SIGNAL_WEIGHTS.wifiHashMatch;
      reasons.push('wifiHashMatch');
    } else if (!signals.venueHasWifi) {
      reasons.push('noVenueWifi');
    } else if (!signals.wifiHashProvided) {
      reasons.push('wifiMissing');
    } else {
      reasons.push('wifiHashMismatch');
    }

    if (signals.lowRiskDevice) {
      score += TRUST_SIGNAL_WEIGHTS.lowRiskDevice;
      reasons.push('lowRiskDevice');
    } else {
      reasons.push('unknownDevice');
    }

    return {
      allowed: score >= this.threshold,
      score,
      threshold: this.threshold,
      reasons,
      distanceMeters: signals.distanceMeters ?? null,
    };
  }
}
