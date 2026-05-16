import { ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { DomainError } from '@fairplay/shared-utils';
import { HostAuthGuard } from './host-auth.guard';
import { HostJwtService } from './host-jwt.service';
import type { AppConfigService } from '../config/app-config.service';

const buildContext = (headers: Record<string, string | undefined>): ExecutionContext => {
  const req = { headers, hostClaims: undefined } as unknown as Request;
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => undefined }),
  } as unknown as ExecutionContext;
};

const jwtService = new HostJwtService({ hostJwtSecret: 's'.repeat(64) } as AppConfigService);

describe('HostAuthGuard', () => {
  it('attaches claims and returns true for a valid bearer token', () => {
    const guard = new HostAuthGuard(jwtService);
    const token = jwtService.sign('user-1');
    const ctx = buildContext({ authorization: `Bearer ${token}` });
    expect(guard.canActivate(ctx)).toBe(true);
    const req = ctx.switchToHttp().getRequest<Request>();
    expect(req.hostClaims?.sub).toBe('user-1');
  });

  it('rejects requests without a bearer token', () => {
    const guard = new HostAuthGuard(jwtService);
    expect(() => guard.canActivate(buildContext({}))).toThrow(DomainError);
    expect(() =>
      guard.canActivate(buildContext({ authorization: 'Token abc' })),
    ).toThrow(DomainError);
    expect(() =>
      guard.canActivate(buildContext({ authorization: 'Bearer ' })),
    ).toThrow(DomainError);
  });

  it('rejects requests with an invalid token', () => {
    const guard = new HostAuthGuard(jwtService);
    expect(() =>
      guard.canActivate(buildContext({ authorization: 'Bearer not-a-jwt' })),
    ).toThrow(DomainError);
  });
});
