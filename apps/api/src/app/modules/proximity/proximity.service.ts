import { Injectable, Logger } from '@nestjs/common';
import type { ProximityResult } from '@fairplay/shared-types';
import type { PartySessionRecord } from '../sessions/session.repository';
import { JoinTrustScorer, TrustSignals } from './join-trust-scorer';
import {
  isLowRiskDevice,
  isWithinVenueRadius,
  wifiHashMatches,
} from './proximity-signals';

export interface JoinAttemptInput {
  qrTokenValid: boolean;
  qrTokenProvided: boolean;
  joinCodeValid: boolean;
  joinCodeProvided: boolean;
  guestLocation: { lat: number; lng: number; accuracyMeters: number } | null;
  guestWifiHash: string | null;
  guestDeviceHash: string | null;
}

@Injectable()
export class ProximityService {
  private readonly logger = new Logger(ProximityService.name);

  constructor(private readonly scorer: JoinTrustScorer) {}

  evaluate(session: PartySessionRecord, attempt: JoinAttemptInput, settings: { proximityRequired: boolean }, sessionVenue: {
    lat: number | null;
    lng: number | null;
    radiusMeters: number | null;
    wifiHash: string | null;
  }): ProximityResult {
    const venueHasGps =
      sessionVenue.lat !== null && sessionVenue.lng !== null && sessionVenue.radiusMeters !== null;
    const venueHasWifi = sessionVenue.wifiHash !== null;

    let withinRadius = false;
    let distanceMeters: number | null = null;
    if (venueHasGps && attempt.guestLocation) {
      const probe = isWithinVenueRadius(attempt.guestLocation, {
        lat: sessionVenue.lat as number,
        lng: sessionVenue.lng as number,
        radiusMeters: sessionVenue.radiusMeters as number,
      });
      withinRadius = probe.withinRadius;
      distanceMeters = probe.distanceMeters;
    }

    const wifiMatch = venueHasWifi && wifiHashMatches(attempt.guestWifiHash, sessionVenue.wifiHash);
    const lowRiskDevice = isLowRiskDevice(attempt.guestDeviceHash);

    const signals: TrustSignals = {
      qrTokenValid: attempt.qrTokenValid,
      joinCodeValid: attempt.joinCodeValid,
      gpsWithinRadius: withinRadius,
      wifiHashMatch: wifiMatch,
      lowRiskDevice,
      qrTokenProvided: attempt.qrTokenProvided,
      joinCodeProvided: attempt.joinCodeProvided,
      gpsProvided: attempt.guestLocation !== null,
      wifiHashProvided: attempt.guestWifiHash !== null,
      venueHasGps,
      venueHasWifi,
      distanceMeters,
    };

    const result = this.scorer.score(signals);

    // Privacy: never log the raw lat/lng or the venue/guest Wi-Fi hashes.
    // Distance + accuracy + the boolean signals are enough to debug.
    this.logger.log(
      {
        sessionId: session.id,
        score: result.score,
        threshold: result.threshold,
        allowed: result.allowed,
        reasons: result.reasons,
        distanceMeters: result.distanceMeters,
        accuracyMeters: attempt.guestLocation?.accuracyMeters ?? null,
        proximityRequired: settings.proximityRequired,
      },
      settings.proximityRequired
        ? 'Proximity gate evaluated (enforcing).'
        : 'Proximity gate evaluated (advisory only).',
    );

    // Decision rule: if proximityRequired is false the score is informational
    // and we always permit. If true, we enforce the threshold.
    if (!settings.proximityRequired) {
      return { ...result, allowed: true };
    }
    return result;
  }
}
