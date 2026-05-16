import { ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { AppConfigService } from '../config/app-config.service';
import { GuestAuthGuard } from './guest-auth.guard';
import { GuestJwtService } from './guest-jwt.service';

const buildContext = (headers: Record<string, string | undefined>): ExecutionContext => {
  const req = { headers, guestClaims: undefined } as unknown as Request;
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => undefined }),
  } as unknown as ExecutionContext;
};

const jwtService = new GuestJwtService({ hostJwtSecret: 's'.repeat(64) } as AppConfigService);

describe('GuestAuthGuard', () => {
  it('attaches claims and returns true for a valid bearer token', () => {
    const guard = new GuestAuthGuard(jwtService);
    const token = jwtService.sign('guest-1', 'session-1');
    const ctx = buildContext({ authorization: `Bearer ${token}` });
    expect(guard.canActivate(ctx)).toBe(true);
    const req = ctx.switchToHttp().getRequest<Request>();
    expect(req.guestClaims?.sub).toBe('guest-1');
    expect(req.guestClaims?.sid).toBe('session-1');
  });

  it('rejects requests without a bearer token', () => {
    const guard = new GuestAuthGuard(jwtService);
    expect(() => guard.canActivate(buildContext({}))).toThrow();
    expect(() =>
      guard.canActivate(buildContext({ authorization: 'Token abc' })),
    ).toThrow();
    expect(() =>
      guard.canActivate(buildContext({ authorization: 'Bearer ' })),
    ).toThrow();
  });

  it('rejects requests with an invalid token', () => {
    const guard = new GuestAuthGuard(jwtService);
    expect(() =>
      guard.canActivate(buildContext({ authorization: 'Bearer not-a-jwt' })),
    ).toThrow();
  });
});
