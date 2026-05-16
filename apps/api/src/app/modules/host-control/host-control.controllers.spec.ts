import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DomainExceptionFilter } from '../../common/filters/domain-exception.filter';
import { ResponseEnvelopeInterceptor } from '../../common/interceptors/response-envelope.interceptor';
import { RequestContextMiddleware } from '../../common/middleware/request-context.middleware';
import { AppConfigService } from '../config/app-config.service';
import { HostAuthGuard } from '../spotify-auth/host-auth.guard';
import { HostJwtService } from '../spotify-auth/host-jwt.service';
import { HostControlService } from './host-control.service';
import { HostQueueController } from './host-queue.controller';
import { HostRunnerController } from './host-runner.controller';
import { SessionSettingsService } from './session-settings.service';

const HOST_ID = 'host-1';
const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const ENTRY_ID = '22222222-2222-2222-2222-222222222222';

const cfg = { hostJwtSecret: 's'.repeat(64) } as AppConfigService;

describe('Host control controllers', () => {
  let app: INestApplication;
  let hostJwt: HostJwtService;
  let hostControl: { pinEntry: jest.Mock; unpinEntry: jest.Mock; startRunner: jest.Mock; stopRunner: jest.Mock };
  let settings: { updateSettings: jest.Mock };

  beforeAll(async () => {
    hostJwt = new HostJwtService(cfg);
    hostControl = {
      pinEntry: jest.fn(),
      unpinEntry: jest.fn(),
      startRunner: jest.fn(),
      stopRunner: jest.fn(),
    };
    settings = { updateSettings: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [HostQueueController, HostRunnerController],
      providers: [
        HostAuthGuard,
        { provide: HostJwtService, useValue: hostJwt },
        { provide: HostControlService, useValue: hostControl },
        { provide: SessionSettingsService, useValue: settings },
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
    Object.values(hostControl).forEach((fn) => fn.mockReset());
    settings.updateSettings.mockReset();
  });

  const authHeader = (): string => `Bearer ${hostJwt.sign(HOST_ID)}`;

  describe('POST /queue/:entryId/pin', () => {
    it('401s without a host token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/queue/${ENTRY_ID}/pin`)
        .expect(401);
    });

    it('400s on a malformed entry id', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/queue/not-a-uuid/pin')
        .set('authorization', authHeader())
        .expect(400);
    });

    it('pins and returns the new state', async () => {
      hostControl.pinEntry.mockResolvedValueOnce({
        entryId: ENTRY_ID,
        hostPinned: true,
        score: 1000,
        status: 'PENDING',
      });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/queue/${ENTRY_ID}/pin`)
        .set('authorization', authHeader())
        .expect(200);
      expect(res.body.data.hostPinned).toBe(true);
      expect(hostControl.pinEntry).toHaveBeenCalledWith(ENTRY_ID, HOST_ID);
    });
  });

  describe('POST /queue/:entryId/unpin', () => {
    it('unpins via the service', async () => {
      hostControl.unpinEntry.mockResolvedValueOnce({
        entryId: ENTRY_ID,
        hostPinned: false,
        score: 1,
        status: 'PENDING',
      });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/queue/${ENTRY_ID}/unpin`)
        .set('authorization', authHeader())
        .expect(200);
      expect(res.body.data.hostPinned).toBe(false);
      expect(hostControl.unpinEntry).toHaveBeenCalledWith(ENTRY_ID, HOST_ID);
    });
  });

  describe('POST /sessions/:id/runner/start', () => {
    it('401s without auth', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/sessions/${SESSION_ID}/runner/start`)
        .expect(401);
    });

    it('enables the runner', async () => {
      hostControl.startRunner.mockResolvedValueOnce({
        sessionId: SESSION_ID,
        enabled: true,
        state: 'IDLE',
      });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${SESSION_ID}/runner/start`)
        .set('authorization', authHeader())
        .expect(200);
      expect(res.body.data.enabled).toBe(true);
      expect(hostControl.startRunner).toHaveBeenCalledWith(SESSION_ID, HOST_ID);
    });
  });

  describe('POST /sessions/:id/runner/stop', () => {
    it('disables the runner', async () => {
      hostControl.stopRunner.mockResolvedValueOnce({
        sessionId: SESSION_ID,
        enabled: false,
        state: 'DISABLED',
      });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${SESSION_ID}/runner/stop`)
        .set('authorization', authHeader())
        .expect(200);
      expect(res.body.data.enabled).toBe(false);
    });
  });

  describe('PATCH /sessions/:id/settings', () => {
    it('401s without auth', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/sessions/${SESSION_ID}/settings`)
        .send({ lockSize: 4 })
        .expect(401);
    });

    it('400s on invalid settings (lockSize too large)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/sessions/${SESSION_ID}/settings`)
        .set('authorization', authHeader())
        .send({ lockSize: 99 })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('400s on an unknown field (whitelist+forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/sessions/${SESSION_ID}/settings`)
        .set('authorization', authHeader())
        .send({ noSuchField: true })
        .expect(400);
    });

    it('passes a valid partial through to the service', async () => {
      settings.updateSettings.mockResolvedValueOnce({
        sessionId: SESSION_ID,
        settings: { lockSize: 4 },
      });
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/sessions/${SESSION_ID}/settings`)
        .set('authorization', authHeader())
        .send({ lockSize: 4, scoring: { upvoteWeight: 5 } })
        .expect(200);
      expect(settings.updateSettings).toHaveBeenCalledWith(
        SESSION_ID,
        HOST_ID,
        expect.objectContaining({ lockSize: 4, scoring: { upvoteWeight: 5 } }),
      );
      expect(res.body.data.settings.lockSize).toBe(4);
    });
  });
});
