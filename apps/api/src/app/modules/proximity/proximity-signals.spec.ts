import { createHash } from 'node:crypto';
import { haversineMeters, isLowRiskDevice, isWithinVenueRadius, wifiHashMatches } from './proximity-signals';

const sha256Hex = (input: string): string => createHash('sha256').update(input).digest('hex');

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters({ lat: 40, lng: -74 }, { lat: 40, lng: -74 })).toBe(0);
  });

  it('matches the known great-circle distance NYC ↔ LAX (~3935 km) within 1%', () => {
    const nyc = { lat: 40.6413, lng: -73.7781 };
    const lax = { lat: 33.9416, lng: -118.4085 };
    const km = haversineMeters(nyc, lax) / 1000;
    expect(km).toBeGreaterThan(3895);
    expect(km).toBeLessThan(3975);
  });

  it('returns a small value (~111m) for one-thousandth of a degree of latitude', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0.001, lng: 0 };
    expect(haversineMeters(a, b)).toBeGreaterThan(110);
    expect(haversineMeters(a, b)).toBeLessThan(112);
  });
});

describe('isWithinVenueRadius', () => {
  const venue = { lat: 40.0, lng: -74.0, radiusMeters: 100 };

  it('passes when guest is at the venue', () => {
    const r = isWithinVenueRadius({ lat: 40.0, lng: -74.0, accuracyMeters: 0 }, venue);
    expect(r.withinRadius).toBe(true);
    expect(r.distanceMeters).toBe(0);
  });

  it('fails when guest is far away with no accuracy slack', () => {
    const r = isWithinVenueRadius({ lat: 40.01, lng: -74.0, accuracyMeters: 0 }, venue);
    expect(r.withinRadius).toBe(false);
    expect(r.distanceMeters).toBeGreaterThan(100);
  });

  it('passes when accuracy slack covers the gap', () => {
    // ~111 m north of venue but with 50 m radius + 50 m accuracy = 100 m slack
    const r = isWithinVenueRadius({ lat: 40.001, lng: -74.0, accuracyMeters: 60 }, venue);
    expect(r.withinRadius).toBe(true);
  });

  it('clamps negative accuracy to zero', () => {
    const r = isWithinVenueRadius({ lat: 40.0, lng: -74.0, accuracyMeters: -1000 }, venue);
    expect(r.withinRadius).toBe(true);
    expect(r.distanceMeters).toBe(0);
  });
});

describe('wifiHashMatches', () => {
  const a = sha256Hex('venue-wifi');
  const b = sha256Hex('different-wifi');

  it('matches identical hashes', () => {
    expect(wifiHashMatches(a, a)).toBe(true);
  });

  it('rejects different hashes', () => {
    expect(wifiHashMatches(a, b)).toBe(false);
  });

  it('rejects null/undefined inputs', () => {
    expect(wifiHashMatches(null, a)).toBe(false);
    expect(wifiHashMatches(a, undefined)).toBe(false);
    expect(wifiHashMatches(undefined, undefined)).toBe(false);
  });

  it('rejects different-length inputs even if one is a prefix of the other', () => {
    expect(wifiHashMatches(a, a.slice(0, 32))).toBe(false);
  });
});

describe('isLowRiskDevice', () => {
  it('accepts a sha256-shaped hex digest', () => {
    expect(isLowRiskDevice(sha256Hex('device-1'))).toBe(true);
  });

  it('accepts a 32-char hex digest', () => {
    expect(isLowRiskDevice('a'.repeat(32))).toBe(true);
  });

  it('rejects non-hex strings', () => {
    expect(isLowRiskDevice('not-a-hex-digest')).toBe(false);
  });

  it('rejects empty / null / undefined', () => {
    expect(isLowRiskDevice(null)).toBe(false);
    expect(isLowRiskDevice(undefined)).toBe(false);
    expect(isLowRiskDevice('')).toBe(false);
  });
});
