import type { AppConfigService } from '../config/app-config.service';
import jwt from 'jsonwebtoken';
import { GuestJwtService } from './guest-jwt.service';

const cfg = (secret: string): AppConfigService =>
  ({ hostJwtSecret: secret }) as AppConfigService;

describe('GuestJwtService', () => {
  it('round-trips a guest token with sub and sid claims', () => {
    const svc = new GuestJwtService(cfg('s'.repeat(64)));
    const token = svc.sign('guest-1', 'session-1');
    const claims = svc.verify(token);
    expect(claims.sub).toBe('guest-1');
    expect(claims.sid).toBe('session-1');
    expect(claims.role).toBe('guest');
    expect(claims.aud).toBe('fairplay:guest');
    expect(claims.iss).toBe('fairplay:api');
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects a host JWT (different audience)', () => {
    const guest = new GuestJwtService(cfg('s'.repeat(64)));
    // A token signed for the host audience should not verify here.
    const hostToken = jwt.sign({ role: 'host' }, 's'.repeat(64), {
      subject: 'u-1',
      audience: 'fairplay:host',
      issuer: 'fairplay:api',
      expiresIn: 3600,
    });
    expect(() => guest.verify(hostToken)).toThrow();
  });

  it('rejects a token signed with a different secret', () => {
    const a = new GuestJwtService(cfg('a'.repeat(64)));
    const b = new GuestJwtService(cfg('b'.repeat(64)));
    expect(() => b.verify(a.sign('g', 's'))).toThrow();
  });

  it('rejects malformed input', () => {
    const svc = new GuestJwtService(cfg('s'.repeat(64)));
    expect(() => svc.verify('not-a-jwt')).toThrow();
  });
});
