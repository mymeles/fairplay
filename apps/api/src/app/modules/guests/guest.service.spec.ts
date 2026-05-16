import { createHash } from 'node:crypto';
import { DEFAULT_SESSION_SETTINGS } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import type { AppConfigService } from '../config/app-config.service';
import type { ModerationService } from '../moderation/moderation.service';
import { JoinTrustScorer } from '../proximity/join-trust-scorer';
import { ProximityService } from '../proximity/proximity.service';
import type { PartySessionRecord } from '../sessions/session.repository';
import type { SessionService } from '../sessions/session.service';
import { QrTokenService } from '../sessions/qr-token.service';
import { GuestJwtService } from './guest-jwt.service';
import type { GuestRepository, SessionGuestRecord } from './guest.repository';
import { GuestService } from './guest.service';
import type { GuestWalletRepository } from './guest-wallet.repository';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

const sessionRecord = (overrides: Partial<PartySessionRecord> = {}): PartySessionRecord => ({
  id: SESSION_ID,
  hostUserId: 'host',
  joinCode: 'ABCD12',
  qrTokenHash: 'placeholder',
  status: 'ACTIVE',
  selectedSpotifyDeviceId: null,
  settings: DEFAULT_SESSION_SETTINGS,
  venueLat: null,
  venueLng: null,
  venueRadiusMeters: null,
  venueWifiHash: null,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  endedAt: null,
  ...overrides,
});

const guestRecord = (overrides: Partial<SessionGuestRecord> = {}): SessionGuestRecord => ({
  id: GUEST_ID,
  sessionId: SESSION_ID,
  displayName: 'Alice',
  deviceHash: null,
  role: 'GUEST',
  status: 'ACTIVE',
  joinedAt: new Date(),
  lastSeenAt: null,
  ...overrides,
});

const makeSessions = (record: PartySessionRecord = sessionRecord()): jest.Mocked<SessionService> =>
  ({
    loadJoinable: jest.fn().mockResolvedValue(record),
  }) as unknown as jest.Mocked<SessionService>;

const makeGuestRepo = (
  existing: SessionGuestRecord | null = null,
): jest.Mocked<GuestRepository> =>
  ({
    create: jest.fn().mockResolvedValue(guestRecord()),
    findActiveByDevice: jest.fn().mockResolvedValue(existing),
    findLatestByDevice: jest.fn().mockResolvedValue(existing),
    findById: jest.fn(),
    touchLastSeen: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<GuestRepository>;

const makeWalletRepo = (
  existing: { boostTokens: number; challengeTokens: number } | null = null,
): jest.Mocked<GuestWalletRepository> =>
  ({
    create: jest.fn().mockImplementation(async (input) => ({ ...input })),
    findByGuestId: jest.fn().mockResolvedValue(
      existing ? { sessionId: SESSION_ID, guestId: GUEST_ID, ...existing } : null,
    ),
  }) as unknown as jest.Mocked<GuestWalletRepository>;

const guestJwt = new GuestJwtService({ hostJwtSecret: 's'.repeat(64) } as AppConfigService);

const makeProximity = (): ProximityService => new ProximityService(new JoinTrustScorer());

const makeModeration = (): jest.Mocked<ModerationService> =>
  ({
    assertJoinAllowed: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<ModerationService>;

const buildService = (
  session: PartySessionRecord = sessionRecord(),
  qr: QrTokenService = new QrTokenService(),
  guests: jest.Mocked<GuestRepository> = makeGuestRepo(),
  wallets: jest.Mocked<GuestWalletRepository> = makeWalletRepo(),
  proximity: ProximityService = makeProximity(),
  moderation: jest.Mocked<ModerationService> = makeModeration(),
): { svc: GuestService; sessions: jest.Mocked<SessionService>; guests: jest.Mocked<GuestRepository>; wallets: jest.Mocked<GuestWalletRepository>; moderation: jest.Mocked<ModerationService> } => {
  const sessions = makeSessions(session);
  const svc = new GuestService(sessions, qr, guests, wallets, guestJwt, proximity, moderation);
  return { svc, sessions, guests, wallets, moderation };
};

describe('GuestService.joinSession (proof + wallet + JWT)', () => {
  it('creates a guest, wallet, and JWT when joining with a valid join code', async () => {
    const { svc, guests, wallets } = buildService();

    const result = await svc.joinSession(SESSION_ID, {
      displayName: 'Alice',
      joinCode: 'abcd12',
    });

    expect(guests.create).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, displayName: 'Alice' }),
    );
    expect(wallets.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        guestId: GUEST_ID,
        boostTokens: DEFAULT_SESSION_SETTINGS.initialBoostTokens,
        challengeTokens: DEFAULT_SESSION_SETTINGS.initialChallengeTokens,
      }),
    );
    expect(result.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const claims = guestJwt.verify(result.token);
    expect(claims.sub).toBe(GUEST_ID);
    expect(claims.sid).toBe(SESSION_ID);
    expect(result.proximity.allowed).toBe(true); // advisory mode by default
  });

  it('joins via QR token by hashing and matching against qr_token_hash', async () => {
    const qr = new QrTokenService();
    const tokens = qr.generate();
    const session = sessionRecord({ qrTokenHash: tokens.tokenHash });
    const { svc } = buildService(session, qr);

    const result = await svc.joinSession(SESSION_ID, {
      displayName: 'Bob',
      qrToken: tokens.token,
    });
    expect(result.guest.id).toBe(GUEST_ID);
  });

  it('rejects when neither joinCode nor qrToken is supplied', async () => {
    const { svc } = buildService();
    await expect(svc.joinSession(SESSION_ID, { displayName: 'Alice' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('rejects an incorrect join code with UNAUTHORIZED', async () => {
    const { svc } = buildService(sessionRecord({ joinCode: 'CORRECT' }));
    await expect(
      svc.joinSession(SESSION_ID, { displayName: 'Alice', joinCode: 'WRONG1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects a forged QR token with UNAUTHORIZED', async () => {
    const { svc } = buildService(sessionRecord({ qrTokenHash: 'a'.repeat(64) }));
    await expect(
      svc.joinSession(SESSION_ID, { displayName: 'Alice', qrToken: 'forged-token' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('reuses an existing guest when the same device rejoins', async () => {
    const existing = guestRecord({ deviceHash: 'fp-1', displayName: 'Old Name' });
    const guests = makeGuestRepo(existing);
    const wallets = makeWalletRepo({ boostTokens: 1, challengeTokens: 0 });
    const { svc } = buildService(sessionRecord(), new QrTokenService(), guests, wallets);

    const result = await svc.joinSession(SESSION_ID, {
      displayName: 'New Name',
      joinCode: 'ABCD12',
      deviceHash: 'fp-1',
    });

    expect(guests.create).not.toHaveBeenCalled();
    expect(guests.findLatestByDevice).toHaveBeenCalledWith(SESSION_ID, 'fp-1');
    expect(guests.touchLastSeen).toHaveBeenCalledWith(GUEST_ID);
    expect(wallets.create).not.toHaveBeenCalled();
    expect(result.wallet.boostTokens).toBe(1);
  });

  it('blocks a banned device from rejoining', async () => {
    const banned = guestRecord({ deviceHash: 'fp-1', status: 'BANNED' });
    const guests = makeGuestRepo(banned);
    const { svc } = buildService(sessionRecord(), new QrTokenService(), guests);

    await expect(
      svc.joinSession(SESSION_ID, {
        displayName: 'Alice',
        joinCode: 'ABCD12',
        deviceHash: 'fp-1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(guests.create).not.toHaveBeenCalled();
  });

  it('propagates SESSION_EXPIRED from sessionService.loadJoinable', async () => {
    const sessions = makeSessions();
    sessions.loadJoinable.mockRejectedValue(new DomainError('SESSION_EXPIRED', 'expired'));
    const svc = new GuestService(
      sessions,
      new QrTokenService(),
      makeGuestRepo(),
      makeWalletRepo(),
      guestJwt,
      makeProximity(),
      makeModeration(),
    );
    await expect(
      svc.joinSession(SESSION_ID, { displayName: 'A', joinCode: 'ABCD12' }),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
});

describe('GuestService.joinSession (proximity gate, M05)', () => {
  const requiredSession = (overrides: Partial<PartySessionRecord> = {}) =>
    sessionRecord({
      settings: { ...DEFAULT_SESSION_SETTINGS, proximityRequired: true },
      ...overrides,
    });

  it('passes through with proximityRequired=false even when only joinCode is valid (low score)', async () => {
    const { svc } = buildService(); // default proximityRequired=false
    const result = await svc.joinSession(SESSION_ID, {
      displayName: 'Alice',
      joinCode: 'ABCD12',
    });
    // Score = 25 (joinCodeValid) — below threshold 50, but advisory mode permits.
    expect(result.proximity.score).toBe(25);
    expect(result.proximity.allowed).toBe(true);
  });

  it('blocks low-score joins when proximityRequired=true', async () => {
    const { svc } = buildService(requiredSession());
    const promise = svc.joinSession(SESSION_ID, {
      displayName: 'Alice',
      joinCode: 'ABCD12',
    });
    await expect(promise).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Join blocked by proximity check.',
      details: expect.objectContaining({ score: 25, threshold: 50 }),
    });
  });

  it('allows the join when proximityRequired=true and QR + GPS in radius (65)', async () => {
    const qr = new QrTokenService();
    const tokens = qr.generate();
    const session = requiredSession({
      qrTokenHash: tokens.tokenHash,
      venueLat: 40.0,
      venueLng: -74.0,
      venueRadiusMeters: 100,
    });
    const { svc } = buildService(session, qr);
    const result = await svc.joinSession(SESSION_ID, {
      displayName: 'Alice',
      qrToken: tokens.token,
      location: { lat: 40.0, lng: -74.0, accuracyMeters: 5 },
    });
    expect(result.proximity.allowed).toBe(true);
    expect(result.proximity.score).toBe(65);
  });

  it('allows the join when proximityRequired=true and joinCode + Wi-Fi match (55)', async () => {
    const wifi = sha('venue-wifi-XYZ');
    const session = requiredSession({ venueWifiHash: wifi });
    const { svc } = buildService(session);
    const result = await svc.joinSession(SESSION_ID, {
      displayName: 'Alice',
      joinCode: 'ABCD12',
      wifiHash: wifi,
    });
    expect(result.proximity.allowed).toBe(true);
    expect(result.proximity.score).toBe(55);
  });

  it('blocks when GPS is far away even with valid joinCode (proximityRequired=true)', async () => {
    const session = requiredSession({
      venueLat: 40.0,
      venueLng: -74.0,
      venueRadiusMeters: 100,
    });
    const { svc } = buildService(session);
    await expect(
      svc.joinSession(SESSION_ID, {
        displayName: 'Alice',
        joinCode: 'ABCD12',
        location: { lat: 41.0, lng: -75.0, accuracyMeters: 5 },
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      details: expect.objectContaining({
        reasons: expect.arrayContaining(['gpsOutsideRadius']),
      }),
    });
  });

  it('returns reasons in the success body for advisory mode', async () => {
    const { svc } = buildService();
    const result = await svc.joinSession(SESSION_ID, {
      displayName: 'Alice',
      joinCode: 'ABCD12',
    });
    expect(result.proximity.reasons).toEqual(expect.arrayContaining(['joinCodeValid']));
  });
});
