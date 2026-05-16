import { QrTokenService } from './qr-token.service';

describe('QrTokenService', () => {
  it('returns a url-safe token plus its sha256 hash', () => {
    const svc = new QrTokenService();
    const { token, tokenHash } = svc.generate();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifies a token against its own hash', () => {
    const svc = new QrTokenService();
    const { token, tokenHash } = svc.generate();
    expect(svc.verify(token, tokenHash)).toBe(true);
  });

  it('rejects a token with the wrong hash', () => {
    const svc = new QrTokenService();
    const a = svc.generate();
    const b = svc.generate();
    expect(svc.verify(a.token, b.tokenHash)).toBe(false);
  });

  it('returns false for empty inputs', () => {
    const svc = new QrTokenService();
    expect(svc.verify('', 'x'.repeat(64))).toBe(false);
    expect(svc.verify('abc', '')).toBe(false);
  });

  it('produces distinct tokens on each call', () => {
    const svc = new QrTokenService();
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) seen.add(svc.generate().token);
    expect(seen.size).toBe(50);
  });
});
