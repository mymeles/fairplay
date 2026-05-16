import { JoinTrustScorer, MINIMUM_REQUIRED_SCORE, TRUST_SIGNAL_WEIGHTS } from './join-trust-scorer';

const empty = (): Parameters<JoinTrustScorer['score']>[0] => ({
  qrTokenValid: false,
  joinCodeValid: false,
  gpsWithinRadius: false,
  wifiHashMatch: false,
  lowRiskDevice: false,
});

describe('JoinTrustScorer.score', () => {
  let scorer: JoinTrustScorer;
  beforeEach(() => {
    scorer = new JoinTrustScorer();
  });

  it('uses weights and threshold pinned by the milestone doc', () => {
    expect(TRUST_SIGNAL_WEIGHTS.qrTokenValid).toBe(40);
    expect(TRUST_SIGNAL_WEIGHTS.joinCodeValid).toBe(25);
    expect(TRUST_SIGNAL_WEIGHTS.gpsWithinRadius).toBe(25);
    expect(TRUST_SIGNAL_WEIGHTS.wifiHashMatch).toBe(30);
    expect(TRUST_SIGNAL_WEIGHTS.lowRiskDevice).toBe(10);
    expect(MINIMUM_REQUIRED_SCORE).toBe(50);
    expect(scorer.threshold).toBe(50);
  });

  it('scores zero with no signals and is not allowed', () => {
    const r = scorer.score(empty());
    expect(r.score).toBe(0);
    expect(r.allowed).toBe(false);
  });

  it('valid QR alone (40) is below threshold', () => {
    const r = scorer.score({ ...empty(), qrTokenValid: true });
    expect(r.score).toBe(40);
    expect(r.reasons).toContain('qrTokenValid');
    expect(r.allowed).toBe(false);
  });

  it('valid QR + GPS in radius (40 + 25 = 65) passes', () => {
    const r = scorer.score({ ...empty(), qrTokenValid: true, gpsWithinRadius: true });
    expect(r.score).toBe(65);
    expect(r.allowed).toBe(true);
    expect(r.reasons).toEqual(expect.arrayContaining(['qrTokenValid', 'gpsWithinRadius']));
  });

  it('valid join code + Wi-Fi (25 + 30 = 55) passes', () => {
    const r = scorer.score({ ...empty(), joinCodeValid: true, wifiHashMatch: true });
    expect(r.score).toBe(55);
    expect(r.allowed).toBe(true);
  });

  it('all signals (130) passes', () => {
    const r = scorer.score({
      qrTokenValid: true,
      joinCodeValid: true,
      gpsWithinRadius: true,
      wifiHashMatch: true,
      lowRiskDevice: true,
    });
    expect(r.score).toBe(130);
    expect(r.allowed).toBe(true);
  });

  it('reports qrTokenInvalid when token was provided but invalid', () => {
    const r = scorer.score({ ...empty(), qrTokenProvided: true });
    expect(r.reasons).toContain('qrTokenInvalid');
    expect(r.score).toBe(0);
  });

  it('reports gpsMissing when venue has GPS but guest did not send any', () => {
    const r = scorer.score({ ...empty(), venueHasGps: true });
    expect(r.reasons).toContain('gpsMissing');
  });

  it('reports noVenueGps when the venue itself has no GPS configured', () => {
    const r = scorer.score({ ...empty(), gpsProvided: true, venueHasGps: false });
    expect(r.reasons).toContain('noVenueGps');
  });

  it('reports gpsOutsideRadius when guest sent GPS but it was too far', () => {
    const r = scorer.score({
      ...empty(),
      gpsProvided: true,
      venueHasGps: true,
      gpsWithinRadius: false,
    });
    expect(r.reasons).toContain('gpsOutsideRadius');
  });

  it('returns distanceMeters from the input signals (passed through)', () => {
    const r = scorer.score({ ...empty(), distanceMeters: 42.5, gpsProvided: true, venueHasGps: true });
    expect(r.distanceMeters).toBe(42.5);
  });
});
