import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DomainExceptionFilter } from '../../common/filters/domain-exception.filter';
import { ResponseEnvelopeInterceptor } from '../../common/interceptors/response-envelope.interceptor';
import { RequestContextMiddleware } from '../../common/middleware/request-context.middleware';
import { AppConfigService } from '../config/app-config.service';
import { GuestAuthGuard } from '../guests/guest-auth.guard';
import { GuestJwtService } from '../guests/guest-jwt.service';
import { HostAuthGuard } from '../spotify-auth/host-auth.guard';
import { HostJwtService } from '../spotify-auth/host-jwt.service';
import { BoostService } from './boost.service';
import { GuestWalletService } from './guest-wallet.service';
import {
  GuestWalletController,
  HostTokenGrantController,
  QueueBoostController,
} from './token.controller';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const HOST_ID = '33333333-3333-3333-3333-333333333333';
const ENTRY_ID = '44444444-4444-4444-4444-444444444444';
const cfg = { hostJwtSecret: 's'.repeat(64) } as AppConfigService;

describe('Token controllers', () => {
  let app: INestApplication;
  let guestJwt: GuestJwtService;
  let hostJwt: HostJwtService;
  let wallets: { getWallet: jest.Mock; grantTokens: jest.Mock };
  let boosts: { applyBoost: jest.Mock };

  beforeAll(async () => {
    guestJwt = new GuestJwtService(cfg);
    hostJwt = new HostJwtService(cfg);
    wallets = {
      getWallet: jest.fn(),
      grantTokens: jest.fn(),
    };
    boosts = { applyBoost: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [GuestWalletController, QueueBoostController, HostTokenGrantController],
      providers: [
        GuestAuthGuard,
        HostAuthGuard,
        { provide: GuestJwtService, useValue: guestJwt },
        { provide: HostJwtService, useValue: hostJwt },
        { provide: GuestWalletService, useValue: wallets },
        { provide: BoostService, useValue: boosts },
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

  beforeEach(() => {
    wallets.getWallet.mockReset();
    wallets.grantTokens.mockReset();
    boosts.applyBoost.mockReset();
  });

  const guestAuth = (): string => `Bearer ${guestJwt.sign(GUEST_ID, SESSION_ID)}`;
  const hostAuth = (): string => `Bearer ${hostJwt.sign(HOST_ID)}`;

  describe('GET /guests/me/wallet', () => {
    it('401s without a guest token', async () => {
      await request(app.getHttpServer()).get('/api/v1/guests/me/wallet').expect(401);
    });

    it('returns the authenticated guest wallet', async () => {
      wallets.getWallet.mockResolvedValueOnce({
        guestId: GUEST_ID,
        sessionId: SESSION_ID,
        boostTokens: 3,
        challengeTokens: 1,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/guests/me/wallet')
        .set('authorization', guestAuth())
        .expect(200);

      expect(res.body.data.boostTokens).toBe(3);
      expect(wallets.getWallet).toHaveBeenCalledWith(GUEST_ID, SESSION_ID);
    });
  });

  describe('POST /queue/:entryId/apply-boost', () => {
    it('401s without a guest token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/queue/${ENTRY_ID}/apply-boost`)
        .expect(401);
    });

    it('400s on malformed entry id', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/queue/not-a-uuid/apply-boost')
        .set('authorization', guestAuth())
        .expect(400);
    });

    it('applies a boost as the authenticated guest', async () => {
      boosts.applyBoost.mockResolvedValueOnce({
        entry: {
          id: ENTRY_ID,
          sessionId: SESSION_ID,
          status: 'PENDING',
          boostCredits: 1,
          score: 3,
        },
        wallet: {
          guestId: GUEST_ID,
          sessionId: SESSION_ID,
          boostTokens: 2,
          challengeTokens: 1,
        },
        idempotent: false,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/queue/${ENTRY_ID}/apply-boost`)
        .set('authorization', guestAuth())
        .expect(200);

      expect(res.body.data.entry.boostCredits).toBe(1);
      expect(boosts.applyBoost).toHaveBeenCalledWith(ENTRY_ID, GUEST_ID, SESSION_ID);
    });
  });

  describe('POST /sessions/:sessionId/guests/:guestId/grant-tokens', () => {
    it('401s without a host token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/sessions/${SESSION_ID}/guests/${GUEST_ID}/grant-tokens`)
        .send({ boostTokens: 1 })
        .expect(401);
    });

    it('400s on invalid grant body', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/sessions/${SESSION_ID}/guests/${GUEST_ID}/grant-tokens`)
        .set('authorization', hostAuth())
        .send({ boostTokens: -1 })
        .expect(400);
    });

    it('passes a valid grant through to the wallet service', async () => {
      wallets.grantTokens.mockResolvedValueOnce({
        wallet: {
          guestId: GUEST_ID,
          sessionId: SESSION_ID,
          boostTokens: 5,
          challengeTokens: 2,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${SESSION_ID}/guests/${GUEST_ID}/grant-tokens`)
        .set('authorization', hostAuth())
        .send({ boostTokens: 2, challengeTokens: 1 })
        .expect(200);

      expect(res.body.data.wallet.boostTokens).toBe(5);
      expect(wallets.grantTokens).toHaveBeenCalledWith(
        SESSION_ID,
        GUEST_ID,
        HOST_ID,
        expect.objectContaining({ boostTokens: 2, challengeTokens: 1 }),
      );
    });
  });
});
