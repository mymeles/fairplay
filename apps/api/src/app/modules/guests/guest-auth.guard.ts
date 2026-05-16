import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DomainError } from '@fairplay/shared-utils';
import { GuestJwtClaims, GuestJwtService } from './guest-jwt.service';

declare module 'express-serve-static-core' {
  interface Request {
    guestClaims?: GuestJwtClaims;
  }
}

@Injectable()
export class GuestAuthGuard implements CanActivate {
  constructor(private readonly guestJwt: GuestJwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new DomainError('UNAUTHORIZED', 'Missing bearer token.');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new DomainError('UNAUTHORIZED', 'Missing bearer token.');
    }
    req.guestClaims = this.guestJwt.verify(token);
    return true;
  }
}
