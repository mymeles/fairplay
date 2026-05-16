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
import { ChallengeService } from './challenge.service';
import { LockWindowController } from './lock-window.controller';
import { LockWindowService } from './lock-window.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const HOST_ID = '33333333-3333-3333-3333-333333333333';
const ENTRY_ID = '44444444-4444-4444-4444-444444444444';
const cfg = { hostJwtSecret: 's'.repeat(64) } as AppConfigService;

const challengeResult = {
  entry: {
    id: ENTRY_ID,
    sessionId: SESSION_ID,
    status: 'PENDING' as const,
    score: 3.5,
    lockedUntil: null,
  },
  wallet: {
    guestId: GUEST_ID,
    sessionId: SESSION_ID,
    boostTokens: 3,
    challengeTokens: 0,
  },
};

const vetoResult = {
  entry: {
    id: ENTRY_ID,
    sessionId: SESSION_ID,
    status: 'VETOED' as const,
    score: 3.5,
    lockedUntil: '2026-01-01T00:01:30.000Z',
  },
};

describe('LockWindowController', () => {
  let app: INestApplication;
  let guestJwt: GuestJwtService;
  let hostJwt: HostJwtService;
  let challengeService: { challengeLock: jest.Mock };
  let lockWindowService: { vetoEntry: jest.Mock };

  beforeAll(async () => {
    guestJwt = new GuestJwtService(cfg);
    hostJwt = new HostJwtService(cfg);
    challengeService = { challengeLock: jest.fn() };
    lockWindowService = { vetoEntry: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [LockWindowController],
      providers: [
        GuestAuthGuard,
        HostAuthGuard,
        { provide: GuestJwtService, useValue: guestJwt },
        { provide: HostJwtService, useValue: hostJwt },
        { provide: ChallengeService, useValue: challengeService },
        { provide: LockWindowService, useValue: lockWindowService },
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
    challengeService.challengeLock.mockReset();
    lockWindowService.vetoEntry.mockReset();
  });

  const guestAuth = (): string => `Bearer ${guestJwt.sign(GUEST_ID, SESSION_ID)}`;
  const hostAuth = (): string => `Bearer ${hostJwt.sign(HOST_ID)}`;

  describe('POST /api/v1/queue/:entryId/challenge-lock', () => {
    it('401s without a guest token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/queue/${ENTRY_ID}/challenge-lock`)
        .expect(401);
    });

    it('400s on a malformed entry uuid', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/queue/not-a-uuid/challenge-lock')
        .set('authorization', guestAuth())
        .expect(400);
    });

    it('challenges a locked entry using the guest session scope', async () => {
      challengeService.challengeLock.mockResolvedValueOnce(challengeResult);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/queue/${ENTRY_ID}/challenge-lock`)
        .set('authorization', guestAuth())
        .expect(200);

      expect(res.body.data).toEqual(challengeResult);
      expect(challengeService.challengeLock).toHaveBeenCalledWith(ENTRY_ID, GUEST_ID, SESSION_ID);
    });
  });

  describe('POST /api/v1/queue/:entryId/veto', () => {
    it('401s without a host token', async () => {
      await request(app.getHttpServer()).post(`/api/v1/queue/${ENTRY_ID}/veto`).expect(401);
    });

    it('vetoes a queue entry as the host', async () => {
      lockWindowService.vetoEntry.mockResolvedValueOnce(vetoResult);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/queue/${ENTRY_ID}/veto`)
        .set('authorization', hostAuth())
        .expect(200);

      expect(res.body.data).toEqual(vetoResult);
      expect(lockWindowService.vetoEntry).toHaveBeenCalledWith(ENTRY_ID, HOST_ID);
    });
  });
});
