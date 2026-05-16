import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DEFAULT_SESSION_SETTINGS } from '@fairplay/shared-types';
import { AppConfigService } from '../config/app-config.service';
import { DomainExceptionFilter } from '../../common/filters/domain-exception.filter';
import { ResponseEnvelopeInterceptor } from '../../common/interceptors/response-envelope.interceptor';
import { RequestContextMiddleware } from '../../common/middleware/request-context.middleware';
import { GuestService } from '../guests/guest.service';
import { HostAuthGuard } from '../spotify-auth/host-auth.guard';
import { HostJwtService } from '../spotify-auth/host-jwt.service';
import { JoinCodeService } from './join-code.service';
import { QrTokenService } from './qr-token.service';
import { SessionController } from './session.controller';
import { SessionRepository } from './session.repository';
import { SessionService } from './session.service';

const cfg = { hostJwtSecret: 's'.repeat(64) } as AppConfigService;
const SESSION_ID = '11111111-1111-1111-1111-111111111111';

describe('SessionController', () => {
  let app: INestApplication;
  let hostJwt: HostJwtService;
  let sessionService: { createSession: jest.Mock; getSession: jest.Mock; getPublicByCode: jest.Mock; endSession: jest.Mock };
  let guestService: { joinSession: jest.Mock };

  beforeAll(async () => {
    hostJwt = new HostJwtService(cfg);
    sessionService = {
      createSession: jest.fn(),
      getSession: jest.fn(),
      getPublicByCode: jest.fn(),
      endSession: jest.fn(),
    };
    guestService = { joinSession: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [
        HostAuthGuard,
        { provide: HostJwtService, useValue: hostJwt },
        { provide: SessionService, useValue: sessionService },
        { provide: GuestService, useValue: guestService },
        { provide: SessionRepository, useValue: {} },
        { provide: JoinCodeService, useValue: {} },
        { provide: QrTokenService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    const middleware = new RequestContextMiddleware();
    app.use(middleware.use.bind(middleware));
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const authHeader = (userId = 'host-1'): string => `Bearer ${hostJwt.sign(userId)}`;

  describe('POST /api/v1/sessions', () => {
    it('401s without bearer token', async () => {
      await request(app.getHttpServer()).post('/api/v1/sessions').send({}).expect(401);
    });

    it('creates a session and returns joinCode + qrToken', async () => {
      sessionService.createSession.mockResolvedValueOnce({
        session: {
          id: SESSION_ID,
          hostUserId: 'host-1',
          joinCode: 'ABCD12',
          status: 'ACTIVE',
          selectedSpotifyDeviceId: null,
          settings: DEFAULT_SESSION_SETTINGS,
          venue: null,
          hasVenueWifi: false,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          endedAt: null,
        },
        joinCode: 'ABCD12',
        qrToken: 'tok',
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/sessions')
        .set('authorization', authHeader())
        .send({})
        .expect(201);
      expect(res.body.data.joinCode).toBe('ABCD12');
      expect(res.body.data.qrToken).toBe('tok');
      expect(res.body.data.session.id).toBe(SESSION_ID);
      expect(sessionService.createSession).toHaveBeenCalledWith('host-1', {
        settingsOverride: undefined,
        venue: undefined,
        venueWifiHash: undefined,
      });
    });

    it('rejects unknown settings keys', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sessions')
        .set('authorization', authHeader())
        .send({ settings: { lockSize: 2, badKey: true } })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('passes settings overrides through to the service', async () => {
      sessionService.createSession.mockResolvedValueOnce({
        session: {
          id: SESSION_ID,
          hostUserId: 'host-1',
          joinCode: 'X',
          status: 'ACTIVE',
          selectedSpotifyDeviceId: null,
          settings: { ...DEFAULT_SESSION_SETTINGS, lockSize: 3 },
          venue: null,
          hasVenueWifi: false,
          createdAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
          endedAt: null,
        },
        joinCode: 'X',
        qrToken: 'T',
      });
      await request(app.getHttpServer())
        .post('/api/v1/sessions')
        .set('authorization', authHeader())
        .send({ settings: { lockSize: 3 } })
        .expect(201);
      expect(sessionService.createSession).toHaveBeenCalledWith('host-1', {
        settingsOverride: { lockSize: 3 },
        venue: undefined,
        venueWifiHash: undefined,
      });
    });
  });

  describe('GET /api/v1/sessions/by-code/:joinCode', () => {
    it('returns the public summary (no settings, no host id)', async () => {
      sessionService.getPublicByCode.mockResolvedValueOnce({
        id: SESSION_ID,
        joinCode: 'ABCD12',
        status: 'ACTIVE',
        expiresAt: new Date().toISOString(),
      });
      const res = await request(app.getHttpServer())
        .get('/api/v1/sessions/by-code/abcd12')
        .expect(200);
      expect(res.body.data.id).toBe(SESSION_ID);
      expect(res.body.data).not.toHaveProperty('settings');
      // The controller normalizes lower-case input to upper-case before service.
      expect(sessionService.getPublicByCode).toHaveBeenCalledWith('ABCD12');
    });
  });

  describe('GET /api/v1/sessions/:sessionId', () => {
    it('401s without auth', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/sessions/${SESSION_ID}`)
        .expect(401);
    });

    it('rejects a non-uuid path', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sessions/not-a-uuid')
        .set('authorization', authHeader())
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns the session for the owning host', async () => {
      sessionService.getSession.mockResolvedValueOnce({
        id: SESSION_ID,
        hostUserId: 'host-1',
        joinCode: 'ABCD12',
        status: 'ACTIVE',
        selectedSpotifyDeviceId: null,
        settings: DEFAULT_SESSION_SETTINGS,
        venue: null,
        hasVenueWifi: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        endedAt: null,
      });
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sessions/${SESSION_ID}`)
        .set('authorization', authHeader())
        .expect(200);
      expect(res.body.data.id).toBe(SESSION_ID);
      expect(sessionService.getSession).toHaveBeenCalledWith(SESSION_ID, 'host-1');
    });
  });

  describe('POST /api/v1/sessions/:sessionId/join', () => {
    it('returns the joined guest, wallet, and JWT', async () => {
      guestService.joinSession.mockResolvedValueOnce({
        guest: {
          id: 'guest-1',
          sessionId: SESSION_ID,
          displayName: 'Alice',
          role: 'GUEST',
          status: 'ACTIVE',
          joinedAt: new Date().toISOString(),
        },
        wallet: { guestId: 'guest-1', sessionId: SESSION_ID, boostTokens: 3, challengeTokens: 1 },
        token: 'gt',
        sessionId: SESSION_ID,
        proximity: {
          allowed: true,
          score: 25,
          threshold: 50,
          reasons: ['joinCodeValid'],
          distanceMeters: null,
        },
      });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${SESSION_ID}/join`)
        .send({ displayName: 'Alice', joinCode: 'ABCD12' })
        .expect(201);
      expect(res.body.data.guest.id).toBe('guest-1');
      expect(res.body.data.wallet.boostTokens).toBe(3);
      expect(res.body.data.token).toBe('gt');
    });

    it('rejects an empty body', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${SESSION_ID}/join`)
        .send({})
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /api/v1/sessions/:sessionId/end', () => {
    it('marks the session ended for the host', async () => {
      sessionService.endSession.mockResolvedValueOnce({
        id: SESSION_ID,
        hostUserId: 'host-1',
        joinCode: 'X',
        status: 'ENDED',
        selectedSpotifyDeviceId: null,
        settings: DEFAULT_SESSION_SETTINGS,
        venue: null,
        hasVenueWifi: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${SESSION_ID}/end`)
        .set('authorization', authHeader())
        .expect(200);
      expect(res.body.data.status).toBe('ENDED');
    });

    it('401s without auth', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/sessions/${SESSION_ID}/end`)
        .expect(401);
    });
  });
});
