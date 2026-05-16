import { SpotifyCircuitBreaker } from './spotify-circuit-breaker';

const HOST = 'host-1';
const T0 = new Date('2026-05-15T00:00:00Z');
const at = (offsetMs: number): Date => new Date(T0.getTime() + offsetMs);

describe('SpotifyCircuitBreaker', () => {
  it('starts CLOSED for an unseen host', () => {
    const b = new SpotifyCircuitBreaker();
    expect(b.canDispatch(HOST, T0)).toBe(true);
    expect(b.snapshot(HOST).state).toBe('CLOSED');
  });

  it('opens after the failure threshold and blocks dispatch', () => {
    const b = new SpotifyCircuitBreaker();
    b.recordFailure(HOST, T0);
    b.recordFailure(HOST, T0);
    expect(b.snapshot(HOST).state).toBe('CLOSED');
    b.recordFailure(HOST, T0);
    expect(b.snapshot(HOST).state).toBe('OPEN');
    expect(b.canDispatch(HOST, T0)).toBe(false);
  });

  it('moves OPEN → HALF_OPEN after the cooldown and allows one probe', () => {
    const b = new SpotifyCircuitBreaker();
    b.recordFailure(HOST, T0);
    b.recordFailure(HOST, T0);
    b.recordFailure(HOST, T0); // OPEN, 30s base cooldown
    expect(b.canDispatch(HOST, at(29_000))).toBe(false);
    expect(b.canDispatch(HOST, at(30_001))).toBe(true);
    expect(b.snapshot(HOST).state).toBe('HALF_OPEN');
  });

  it('success in HALF_OPEN closes the breaker', () => {
    const b = new SpotifyCircuitBreaker();
    b.recordFailure(HOST, T0);
    b.recordFailure(HOST, T0);
    b.recordFailure(HOST, T0);
    b.canDispatch(HOST, at(30_001)); // probe -> HALF_OPEN
    b.recordSuccess(HOST);
    expect(b.snapshot(HOST).state).toBe('CLOSED');
  });

  it('Retry-After overrides the cooldown exactly', () => {
    const b = new SpotifyCircuitBreaker();
    b.recordRetryAfter(HOST, 10, T0);
    expect(b.canDispatch(HOST, at(5_000))).toBe(false);
    expect(b.canDispatch(HOST, at(10_001))).toBe(true);
  });

  it('forceOpen disables dispatch for a custom cooldown', () => {
    const b = new SpotifyCircuitBreaker();
    b.forceOpen(HOST, 60_000, T0);
    expect(b.canDispatch(HOST, at(30_000))).toBe(false);
    expect(b.canDispatch(HOST, at(60_001))).toBe(true);
  });
});
