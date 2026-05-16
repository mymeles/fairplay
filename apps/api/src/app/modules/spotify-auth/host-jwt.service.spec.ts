import { HostJwtService } from './host-jwt.service';
import type { AppConfigService } from '../config/app-config.service';
import { DomainError } from '@fairplay/shared-utils';

const makeConfig = (secret: string): AppConfigService =>
  ({ hostJwtSecret: secret }) as AppConfigService;

describe('HostJwtService', () => {
  it('round-trips a host token', () => {
    const service = new HostJwtService(makeConfig('s'.repeat(64)));
    const token = service.sign('user-123');
    const claims = service.verify(token);
    expect(claims.sub).toBe('user-123');
    expect(claims.role).toBe('host');
    expect(claims.aud).toBe('fairplay:host');
    expect(claims.iss).toBe('fairplay:api');
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects a token signed with a different secret', () => {
    const a = new HostJwtService(makeConfig('a'.repeat(64)));
    const b = new HostJwtService(makeConfig('b'.repeat(64)));
    const token = a.sign('user-1');
    expect(() => b.verify(token)).toThrow(DomainError);
  });

  it('rejects malformed tokens', () => {
    const service = new HostJwtService(makeConfig('s'.repeat(64)));
    expect(() => service.verify('not-a-jwt')).toThrow(DomainError);
  });
});
