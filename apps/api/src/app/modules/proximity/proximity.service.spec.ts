import { createHash } from 'node:crypto';
import { DEFAULT_SESSION_SETTINGS } from '@fairplay/shared-types';
import type { PartySessionRecord } from '../sessions/session.repository';
import { JoinTrustScorer } from './join-trust-scorer';
import { ProximityService } from './proximity.service';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

const baseSession = (overrides: Partial<PartySessionRecord> = {}): PartySessionRecord => ({
  id: 'sess-1',
  hostUserId: 'host-1',
  joinCode: 'ABCD12',
  qrTokenHash: 'h'.repeat(64),
  status: 'ACTIVE',
  selectedSpotifyDeviceId: null,
  settings: DEFAULT_SESSION_SETTINGS,
  venueLat: null,
  venueLng: null,
  venueRadiusMeters: null,
  venueWifiHash: null,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 3600_000),
  endedAt: null,
  ...overrides,
});

const makeService = (): ProximityService => new ProximityService(new JoinTrustScorer());

describe('ProximityService.evaluate', () => {
  it('passes through the score in advisory mode and always allows', () => {
    const svc = makeService();
    const r = svc.evaluate(
      baseSession(),
      {
        qrTokenValid: false,
        qrTokenProvided: false,
        joinCodeValid: true,
        joinCodeProvided: true,
        guestLocation: null,
        guestWifiHash: null,
        guestDeviceHash: null,
      },
      { proximityRequired: false },
      { lat: null, lng: null, radiusMeters: null, wifiHash: null },
    );
    expect(r.allowed).toBe(true);
    expect(r.score).toBe(25);
    expect(r.reasons).toContain('joinCodeValid');
  });

  it('blocks a low-score join when proximityRequired=true', () => {
    const svc = makeService();
    const r = svc.evaluate(
      baseSession(),
      {
        qrTokenValid: false,
        qrTokenProvided: false,
        joinCodeValid: true,
        joinCodeProvided: true,
        guestLocation: null,
        guestWifiHash: null,
        guestDeviceHash: null,
      },
      { proximityRequired: true },
      { lat: null, lng: null, radiusMeters: null, wifiHash: null },
    );
    expect(r.allowed).toBe(false);
    expect(r.score).toBe(25);
  });

  it('counts gpsWithinRadius when guest is inside the venue', () => {
    const svc = makeService();
    const r = svc.evaluate(
      baseSession(),
      {
        qrTokenValid: true,
        qrTokenProvided: true,
        joinCodeValid: false,
        joinCodeProvided: false,
        guestLocation: { lat: 40.0, lng: -74.0, accuracyMeters: 5 },
        guestWifiHash: null,
        guestDeviceHash: null,
      },
      { proximityRequired: true },
      { lat: 40.0, lng: -74.0, radiusMeters: 100, wifiHash: null },
    );
    // 40 (qr) + 25 (gps) = 65
    expect(r.score).toBe(65);
    expect(r.allowed).toBe(true);
    expect(r.distanceMeters).toBeLessThan(1);
  });

  it('does not count GPS when guest is far away (and blocks under enforcement)', () => {
    const svc = makeService();
    const r = svc.evaluate(
      baseSession(),
      {
        qrTokenValid: false,
        qrTokenProvided: false,
        joinCodeValid: true,
        joinCodeProvided: true,
        guestLocation: { lat: 41.0, lng: -75.0, accuracyMeters: 5 },
        guestWifiHash: null,
        guestDeviceHash: null,
      },
      { proximityRequired: true },
      { lat: 40.0, lng: -74.0, radiusMeters: 100, wifiHash: null },
    );
    expect(r.allowed).toBe(false);
    expect(r.score).toBe(25);
    expect(r.reasons).toContain('gpsOutsideRadius');
  });

  it('counts wifiHashMatch under proximity enforcement', () => {
    const svc = makeService();
    const venueWifi = sha('living-room-5g');
    const r = svc.evaluate(
      baseSession(),
      {
        qrTokenValid: false,
        qrTokenProvided: false,
        joinCodeValid: true,
        joinCodeProvided: true,
        guestLocation: null,
        guestWifiHash: venueWifi,
        guestDeviceHash: null,
      },
      { proximityRequired: true },
      { lat: null, lng: null, radiusMeters: null, wifiHash: venueWifi },
    );
    // 25 (code) + 30 (wifi) = 55
    expect(r.score).toBe(55);
    expect(r.allowed).toBe(true);
  });

  it('counts lowRiskDevice when deviceHash is sha-shaped', () => {
    const svc = makeService();
    const r = svc.evaluate(
      baseSession(),
      {
        qrTokenValid: true,
        qrTokenProvided: true,
        joinCodeValid: false,
        joinCodeProvided: false,
        guestLocation: null,
        guestWifiHash: null,
        guestDeviceHash: sha('device-A'),
      },
      { proximityRequired: true },
      { lat: null, lng: null, radiusMeters: null, wifiHash: null },
    );
    // 40 (qr) + 10 (device) = 50
    expect(r.score).toBe(50);
    expect(r.allowed).toBe(true);
    expect(r.reasons).toContain('lowRiskDevice');
  });

  it('reports noVenueGps when the venue has no coordinates', () => {
    const svc = makeService();
    const r = svc.evaluate(
      baseSession(),
      {
        qrTokenValid: true,
        qrTokenProvided: true,
        joinCodeValid: false,
        joinCodeProvided: false,
        guestLocation: { lat: 40, lng: -74, accuracyMeters: 5 },
        guestWifiHash: null,
        guestDeviceHash: null,
      },
      { proximityRequired: false },
      { lat: null, lng: null, radiusMeters: null, wifiHash: null },
    );
    expect(r.reasons).toContain('noVenueGps');
  });
});
