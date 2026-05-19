import { Injectable } from '@nestjs/common';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { DomainError } from '@fairplay/shared-utils';
import { AppConfigService } from '../config/app-config.service';

const GUEST_TOKEN_AUDIENCE = 'fairplay:guest';
const GUEST_TOKEN_ISSUER = 'fairplay:api';
const GUEST_TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export interface GuestJwtClaims extends JwtPayload {
  sub: string;             // guestId
  sid: string;             // sessionId
  aud: typeof GUEST_TOKEN_AUDIENCE;
  iss: typeof GUEST_TOKEN_ISSUER;
  role: 'guest';
}

@Injectable()
export class GuestJwtService {
  constructor(private readonly config: AppConfigService) {}

  sign(guestId: string, sessionId: string): string {
    return jwt.sign(
      { role: 'guest', sid: sessionId },
      this.config.hostJwtSecret,
      {
        subject: guestId,
        audience: GUEST_TOKEN_AUDIENCE,
        issuer: GUEST_TOKEN_ISSUER,
        expiresIn: GUEST_TOKEN_TTL_SECONDS,
      },
    );
  }

  verify(token: string): GuestJwtClaims {
    try {
      const decoded = jwt.verify(token, this.config.hostJwtSecret, {
        audience: GUEST_TOKEN_AUDIENCE,
        issuer: GUEST_TOKEN_ISSUER,
      });
      if (typeof decoded === 'string' || !decoded.sub || typeof decoded.sid !== 'string') {
        throw new Error('Malformed guest token claims');
      }
      return decoded as GuestJwtClaims;
    } catch (err) {
      throw new DomainError('UNAUTHORIZED', 'Invalid or expired guest token.', {
        reason: err instanceof Error ? err.message : 'verification failed',
      });
    }
  }
}
