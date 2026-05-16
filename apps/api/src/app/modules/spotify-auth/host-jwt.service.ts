import { Injectable } from '@nestjs/common';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { DomainError } from '@fairplay/shared-utils';
import { AppConfigService } from '../config/app-config.service';

const HOST_TOKEN_AUDIENCE = 'fairplay:host';
const HOST_TOKEN_ISSUER = 'fairplay:api';
const HOST_TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export interface HostJwtClaims extends JwtPayload {
  sub: string;
  aud: typeof HOST_TOKEN_AUDIENCE;
  iss: typeof HOST_TOKEN_ISSUER;
  role: 'host';
}

@Injectable()
export class HostJwtService {
  constructor(private readonly config: AppConfigService) {}

  sign(userId: string): string {
    return jwt.sign({ role: 'host' }, this.config.hostJwtSecret, {
      subject: userId,
      audience: HOST_TOKEN_AUDIENCE,
      issuer: HOST_TOKEN_ISSUER,
      expiresIn: HOST_TOKEN_TTL_SECONDS,
    });
  }

  verify(token: string): HostJwtClaims {
    try {
      const decoded = jwt.verify(token, this.config.hostJwtSecret, {
        audience: HOST_TOKEN_AUDIENCE,
        issuer: HOST_TOKEN_ISSUER,
      });
      if (typeof decoded === 'string' || !decoded.sub) {
        throw new Error('Malformed token claims');
      }
      return decoded as HostJwtClaims;
    } catch (err) {
      throw new DomainError('UNAUTHORIZED', 'Invalid or expired host token.', {
        reason: err instanceof Error ? err.message : 'verification failed',
      });
    }
  }
}
