import { createHash } from 'node:crypto';
import { generatePkcePair, generateState } from './pkce';

const base64UrlEncode = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('pkce', () => {
  it('produces a verifier and matching S256 challenge', () => {
    const pair = generatePkcePair();
    expect(pair.method).toBe('S256');
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/);

    const recomputed = base64UrlEncode(createHash('sha256').update(pair.verifier).digest());
    expect(pair.challenge).toBe(recomputed);
  });

  it('emits a fresh verifier on each call', () => {
    const a = generatePkcePair();
    const b = generatePkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });

  it('emits states between 32 and 64 url-safe characters', () => {
    const state = generateState();
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(state.length).toBeGreaterThanOrEqual(32);
    expect(state.length).toBeLessThanOrEqual(64);
  });
});
