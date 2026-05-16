import { DEFAULT_SESSION_SETTINGS } from '@fairplay/shared-types';
import type { JoinCodeService } from './join-code.service';
import { QrTokenService } from './qr-token.service';
import type { PartySessionRecord, SessionRepository } from './session.repository';
import { SessionService } from './session.service';
import type { UserRepository } from '../spotify-auth/user.repository';

const HOST = 'host-1';
const SESSION_ID = '11111111-1111-1111-1111-111111111111';

const baseRecord = (overrides: Partial<PartySessionRecord> = {}): PartySessionRecord => ({
  id: SESSION_ID,
  hostUserId: HOST,
  joinCode: 'ABCD12',
  qrTokenHash: 'h'.repeat(64),
  status: 'ACTIVE',
  selectedSpotifyDeviceId: null,
  settings: DEFAULT_SESSION_SETTINGS,
  venueLat: null,
  venueLng: null,
  venueRadiusMeters: null,
  venueWifiHash: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  endedAt: null,
  ...overrides,
});

const makeRepo = (overrides: Partial<SessionRepository> = {}): jest.Mocked<SessionRepository> =>
  ({
    create: jest.fn(),
    findById: jest.fn(),
    findActiveByJoinCode: jest.fn(),
    existsActiveJoinCode: jest.fn(),
    markEnded: jest.fn(),
    ...overrides,
  }) as unknown as jest.Mocked<SessionRepository>;

const makeJoinCodes = (code: string = 'ABCD12'): jest.Mocked<JoinCodeService> =>
  ({
    generateUnique: jest.fn().mockResolvedValue(code),
    randomCode: jest.fn(),
  }) as unknown as jest.Mocked<JoinCodeService>;

const makeUsers = (selectedDeviceId: string | null = null): jest.Mocked<UserRepository> =>
  ({
    findById: jest.fn().mockResolvedValue({
      id: HOST,
      email: null,
      displayName: null,
      spotifyUserId: 'sp-1',
      selectedDeviceId,
    }),
    setSelectedDeviceId: jest.fn(),
  }) as unknown as jest.Mocked<UserRepository>;

describe('SessionService.createSession', () => {
  it('creates a session with default settings, fresh joinCode, and qrToken', async () => {
    const repo = makeRepo();
    const created = baseRecord({ joinCode: 'ABCD12' });
    repo.create.mockResolvedValue(created);

    const svc = new SessionService(repo, makeJoinCodes('ABCD12'), new QrTokenService(), makeUsers());
    const result = await svc.createSession(HOST);

    expect(result.session.id).toBe(SESSION_ID);
    expect(result.session.settings).toEqual(DEFAULT_SESSION_SETTINGS);
    expect(result.joinCode).toBe('ABCD12');
    expect(result.qrToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        hostUserId: HOST,
        joinCode: 'ABCD12',
        qrTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('inherits the host user\'s selected_device_id at creation', async () => {
    const repo = makeRepo();
    repo.create.mockResolvedValue(baseRecord({ selectedSpotifyDeviceId: 'dev-9' }));
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers('dev-9'));
    await svc.createSession(HOST);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ selectedSpotifyDeviceId: 'dev-9' }),
    );
  });

  it('merges settings overrides on top of defaults', async () => {
    const repo = makeRepo();
    repo.create.mockResolvedValue(baseRecord());
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers());
    await svc.createSession(HOST, {
      settingsOverride: { initialBoostTokens: 7, allowExplicitTracks: false },
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          initialBoostTokens: 7,
          allowExplicitTracks: false,
          lockSize: DEFAULT_SESSION_SETTINGS.lockSize,
        }),
      }),
    );
  });

  it('skips explicit undefined keys in the override (regression: class-transformer fills undefineds)', async () => {
    // Simulates what class-validator's `transform: true` produces — a DTO
    // instance whose declared optional fields exist as `undefined`. Without
    // the undefined-skip, the merge would clobber every default to undefined
    // and we'd persist a near-empty settings_json.
    const overrideFromDto = {
      lockSize: undefined,
      lockDurationSeconds: undefined,
      spotifyQueueDepthTarget: undefined,
      initialBoostTokens: undefined,
      initialChallengeTokens: undefined,
      allowExplicitTracks: undefined,
      duplicateCooldownSeconds: undefined,
      maxSuggestionsPerGuest: undefined,
      proximityRequired: true,
    };
    const repo = makeRepo();
    repo.create.mockResolvedValue(baseRecord());
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers());
    await svc.createSession(HOST, { settingsOverride: overrideFromDto });
    const passed = repo.create.mock.calls[0]![0].settings;
    // All defaults survived even though the override "had" the keys as undefined.
    expect(passed.initialBoostTokens).toBe(DEFAULT_SESSION_SETTINGS.initialBoostTokens);
    expect(passed.lockSize).toBe(DEFAULT_SESSION_SETTINGS.lockSize);
    // The one real override value made it through.
    expect(passed.proximityRequired).toBe(true);
  });
});

describe('SessionService.getSession', () => {
  it('returns the session when the host owns it', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(baseRecord());
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers());
    const summary = await svc.getSession(SESSION_ID, HOST);
    expect(summary.id).toBe(SESSION_ID);
  });

  it('throws FORBIDDEN when another host queries the session', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(baseRecord());
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers());
    await expect(svc.getSession(SESSION_ID, 'someone-else')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws NOT_FOUND when the session does not exist', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(null);
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers());
    await expect(svc.getSession(SESSION_ID, HOST)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('SessionService.getPublicByCode', () => {
  it('returns the session minus host-only fields', async () => {
    const repo = makeRepo();
    repo.findActiveByJoinCode.mockResolvedValue(baseRecord());
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers());
    const result = await svc.getPublicByCode('ABCD12');
    expect(result.id).toBe(SESSION_ID);
    expect(result.joinCode).toBe('ABCD12');
    expect(result.status).toBe('ACTIVE');
    expect(result).not.toHaveProperty('settings');
    expect(result).not.toHaveProperty('hostUserId');
  });

  it('returns NOT_FOUND when no active session matches', async () => {
    const repo = makeRepo();
    repo.findActiveByJoinCode.mockResolvedValue(null);
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers());
    await expect(svc.getPublicByCode('NOPE12')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns SESSION_EXPIRED when the matching session is past expiry', async () => {
    const repo = makeRepo();
    repo.findActiveByJoinCode.mockResolvedValue(baseRecord({ expiresAt: new Date(Date.now() - 1000) }));
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers());
    await expect(svc.getPublicByCode('ABCD12')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
});

describe('SessionService.endSession', () => {
  it('marks the session ended and is idempotent', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(baseRecord());
    repo.markEnded.mockResolvedValue(baseRecord({ status: 'ENDED', endedAt: new Date() }));
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers());
    const first = await svc.endSession(SESSION_ID, HOST);
    expect(first.status).toBe('ENDED');

    repo.findById.mockResolvedValue(baseRecord({ status: 'ENDED', endedAt: new Date() }));
    const second = await svc.endSession(SESSION_ID, HOST);
    expect(second.status).toBe('ENDED');
    expect(repo.markEnded).toHaveBeenCalledTimes(1);
  });
});

describe('SessionService.loadJoinable', () => {
  it('returns the record when the session is ACTIVE and not expired', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(baseRecord());
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers());
    await expect(svc.loadJoinable(SESSION_ID)).resolves.toMatchObject({ id: SESSION_ID });
  });

  it('rejects an ENDED session with SESSION_EXPIRED', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(baseRecord({ status: 'ENDED', endedAt: new Date() }));
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers());
    await expect(svc.loadJoinable(SESSION_ID)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('rejects an expired (by date) session with SESSION_EXPIRED', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(baseRecord({ expiresAt: new Date(Date.now() - 1000) }));
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers());
    await expect(svc.loadJoinable(SESSION_ID)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('rejects a PAUSED session with FORBIDDEN', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(baseRecord({ status: 'PAUSED' }));
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers());
    await expect(svc.loadJoinable(SESSION_ID)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a missing session with NOT_FOUND', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(null);
    const svc = new SessionService(repo, makeJoinCodes(), new QrTokenService(), makeUsers());
    await expect(svc.loadJoinable(SESSION_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
