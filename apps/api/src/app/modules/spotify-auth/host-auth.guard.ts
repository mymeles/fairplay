import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DomainError } from '@fairplay/shared-utils';
import { HostJwtClaims, HostJwtService } from './host-jwt.service';

// `host` is reserved by Express (it shadows the Host header), so we attach
// the verified host JWT claims under `hostClaims` to avoid the readonly
// collision in @types/express-serve-static-core.
declare module 'express-serve-static-core' {
  interface Request {
    hostClaims?: HostJwtClaims;
  }
}

@Injectable()
export class HostAuthGuard implements CanActivate {
  constructor(private readonly hostJwt: HostJwtService) {}

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
    req.hostClaims = this.hostJwt.verify(token);
    return true;
  }
}
