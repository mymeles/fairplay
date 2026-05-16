import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import {
  GuestSummary,
  GuestWalletSummary,
  ProximityResult,
  SessionId,
} from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import { ProximityService } from '../proximity/proximity.service';
import { ModerationService } from '../moderation/moderation.service';
import { JoinCodeService } from '../sessions/join-code.service';
import { QrTokenService } from '../sessions/qr-token.service';
import { SessionService } from '../sessions/session.service';
import { GuestJwtService } from './guest-jwt.service';
import { GuestRepository, SessionGuestRecord } from './guest.repository';
import { GuestWalletRepository } from './guest-wallet.repository';

export interface GuestLocationInput {
  lat: number;
  lng: number;
  accuracyMeters: number;
}

export interface JoinSessionInput {
  displayName: string;
  joinCode?: string;
  qrToken?: string;
  deviceHash?: string;
  location?: GuestLocationInput;
  wifiHash?: string;
}

export interface JoinSessionResult {
  guest: GuestSummary;
  wallet: GuestWalletSummary;
  token: string;
  sessionId: SessionId;
  proximity: ProximityResult;
}

@Injectable()
export class GuestService {
  private readonly logger = new Logger(GuestService.name);

  constructor(
    @Inject(forwardRef(() => SessionService))
    private readonly sessions: SessionService,
    private readonly qrTokens: QrTokenService,
    private readonly guests: GuestRepository,
    private readonly wallets: GuestWalletRepository,
    private readonly guestJwt: GuestJwtService,
    private readonly proximity: ProximityService,
    private readonly moderation: ModerationService,
  ) {}

  async joinSession(sessionId: string, input: JoinSessionInput): Promise<JoinSessionResult> {
    if (!input.joinCode && !input.qrToken) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Either joinCode or qrToken is required to join a session.',
      );
    }

    await this.moderation.assertJoinAllowed(sessionId, {
      displayName: input.displayName,
      ...(input.deviceHash ? { deviceHash: input.deviceHash } : {}),
    });

    const session = await this.sessions.loadJoinable(sessionId);

    // Verify the proof matches THIS session — preventing a code/token from
    // one party being used as a join key for another. Track validity flags
    // separately so the proximity scorer can reward the right signal even
    // when the user submitted both.
    let qrTokenValid = false;
    let joinCodeValid = false;
    if (input.qrToken) {
      qrTokenValid = this.qrTokens.verify(input.qrToken, session.qrTokenHash);
      if (!qrTokenValid && !input.joinCode) {
        throw new DomainError('UNAUTHORIZED', 'QR token does not match this session.');
      }
    }
    if (input.joinCode) {
      const normalized = JoinCodeService.normalize(input.joinCode);
      joinCodeValid = normalized === session.joinCode;
      if (!joinCodeValid && !qrTokenValid) {
        throw new DomainError('UNAUTHORIZED', 'Join code does not match this session.');
      }
    }
    if (!qrTokenValid && !joinCodeValid) {
      // Defensive — shouldn't happen because we already required at least
      // one to be present and one of the branches above would have thrown.
      throw new DomainError('UNAUTHORIZED', 'Join proof did not match this session.');
    }

    // Proximity gate (M05). The service decides whether to enforce based on
    // session settings; advisory mode still computes + logs the score.
    const proximityResult = this.proximity.evaluate(
      session,
      {
        qrTokenValid,
        qrTokenProvided: input.qrToken !== undefined,
        joinCodeValid,
        joinCodeProvided: input.joinCode !== undefined,
        guestLocation: input.location ?? null,
        guestWifiHash: input.wifiHash ?? null,
        guestDeviceHash: input.deviceHash ?? null,
      },
      { proximityRequired: session.settings.proximityRequired },
      {
        lat: session.venueLat,
        lng: session.venueLng,
        radiusMeters: session.venueRadiusMeters,
        wifiHash: session.venueWifiHash,
      },
    );

    if (!proximityResult.allowed) {
      throw new DomainError(
        'FORBIDDEN',
        'Join blocked by proximity check.',
        {
          score: proximityResult.score,
          threshold: proximityResult.threshold,
          reasons: proximityResult.reasons,
        },
      );
    }

    // If the same device is rejoining, reuse the existing non-left guest row
    // so discipline sticks to the device and wallets are not fragmented.
    let guest: SessionGuestRecord | null = null;
    if (input.deviceHash) {
      const deviceGuest = await this.guests.findLatestByDevice(sessionId, input.deviceHash);
      if (deviceGuest?.status === 'BANNED') {
        throw new DomainError('FORBIDDEN', 'This device is banned from the session.');
      }
      if (deviceGuest && deviceGuest.status !== 'LEFT') {
        guest = deviceGuest;
      }
    }
    if (!guest) {
      guest = await this.guests.create({
        sessionId,
        displayName: input.displayName.trim(),
        deviceHash: input.deviceHash ?? null,
      });
    } else {
      await this.guests.touchLastSeen(guest.id);
    }

    let wallet = await this.wallets.findByGuestId(guest.id);
    if (!wallet) {
      wallet = await this.wallets.create({
        sessionId,
        guestId: guest.id,
        boostTokens: session.settings.initialBoostTokens,
        challengeTokens: session.settings.initialChallengeTokens,
      });
    }

    const token = this.guestJwt.sign(guest.id, sessionId);

    this.logger.log(
      { sessionId, guestId: guest.id, reused: !!input.deviceHash },
      'Guest joined session.',
    );

    return {
      guest: {
        id: guest.id,
        sessionId: guest.sessionId,
        displayName: guest.displayName,
        role: guest.role,
        status: guest.status,
        joinedAt: guest.joinedAt.toISOString(),
      },
      wallet: {
        guestId: wallet.guestId,
        sessionId: wallet.sessionId,
        boostTokens: wallet.boostTokens,
        challengeTokens: wallet.challengeTokens,
      },
      token,
      sessionId: session.id,
      proximity: proximityResult,
    };
  }
}
