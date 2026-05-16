import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppConfigService } from '../config/app-config.service';
import { DomainExceptionFilter } from '../../common/filters/domain-exception.filter';
import { ResponseEnvelopeInterceptor } from '../../common/interceptors/response-envelope.interceptor';
import { RequestContextMiddleware } from '../../common/middleware/request-context.middleware';
import { DomainError } from '@fairplay/shared-utils';
import { HostAuthGuard } from '../spotify-auth/host-auth.guard';
import { HostJwtService } from '../spotify-auth/host-jwt.service';
import { HostDeviceController } from './host-device.controller';
import { SpotifyDeviceService } from './spotify-device.service';

const validConfig = {
  hostJwtSecret: 's'.repeat(64),
} as AppConfigService;

describe('HostDeviceController', () => {
  let app: INestApplication;
  let hostJwt: HostJwtService;
  let deviceService: { listDevices: jest.Mock; getPlaybackState: jest.Mock; selectDevice: jest.Mock };

  beforeAll(async () => {
    hostJwt = new HostJwtService(validConfig);
    deviceService = {
      listDevices: jest.fn(),
      getPlaybackState: jest.fn(),
      selectDevice: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [HostDeviceController],
      providers: [
        HostAuthGuard,
        { provide: HostJwtService, useValue: hostJwt },
        { provide: SpotifyDeviceService, useValue: deviceService },
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

  const authHeader = (userId = 'user-1'): string => `Bearer ${hostJwt.sign(userId)}`;

  describe('GET /api/v1/host/spotify/devices', () => {
    it('401s without a bearer token', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/host/spotify/devices').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns the list from the service', async () => {
      deviceService.listDevices.mockResolvedValueOnce({
        devices: [
          {
            id: 'd1',
            name: 'Speaker',
            type: 'Speaker',
            isActive: true,
            isRestricted: false,
            isPrivateSession: false,
            volumePercent: 80,
            supportsVolume: true,
          },
        ],
        selectedDeviceId: 'd1',
      });
      const res = await request(app.getHttpServer())
        .get('/api/v1/host/spotify/devices')
        .set('authorization', authHeader())
        .expect(200);
      expect(res.body.data.devices).toHaveLength(1);
      expect(res.body.data.selectedDeviceId).toBe('d1');
      expect(deviceService.listDevices).toHaveBeenCalledWith('user-1');
    });

    it('returns the friendly empty state when there are no devices', async () => {
      deviceService.listDevices.mockResolvedValueOnce({ devices: [], selectedDeviceId: null });
      const res = await request(app.getHttpServer())
        .get('/api/v1/host/spotify/devices')
        .set('authorization', authHeader())
        .expect(200);
      expect(res.body.data.devices).toEqual([]);
      expect(res.body.data.selectedDeviceId).toBeNull();
    });

    it('maps a non-Premium host to a 403 SPOTIFY_PREMIUM_REQUIRED envelope', async () => {
      deviceService.listDevices.mockImplementationOnce(() => {
        throw new DomainError('SPOTIFY_PREMIUM_REQUIRED', 'Need Premium.');
      });
      const res = await request(app.getHttpServer())
        .get('/api/v1/host/spotify/devices')
        .set('authorization', authHeader())
        .expect(403);
      expect(res.body.error.code).toBe('SPOTIFY_PREMIUM_REQUIRED');
    });
  });

  describe('GET /api/v1/host/spotify/playback-state', () => {
    it('returns active=false when nothing is playing', async () => {
      deviceService.getPlaybackState.mockResolvedValueOnce({ active: false, state: null });
      const res = await request(app.getHttpServer())
        .get('/api/v1/host/spotify/playback-state')
        .set('authorization', authHeader())
        .expect(200);
      expect(res.body.data.active).toBe(false);
      expect(res.body.data.state).toBeNull();
    });
  });

  describe('POST /api/v1/host/spotify/device/select', () => {
    it('rejects a missing deviceId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/host/spotify/device/select')
        .set('authorization', authHeader())
        .send({})
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a non-alphanumeric deviceId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/host/spotify/device/select')
        .set('authorization', authHeader())
        .send({ deviceId: 'has spaces' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns the device transfer result on success', async () => {
      deviceService.selectDevice.mockResolvedValueOnce({ deviceId: 'abcd1234', transferred: true });
      const res = await request(app.getHttpServer())
        .post('/api/v1/host/spotify/device/select')
        .set('authorization', authHeader())
        .send({ deviceId: 'abcd1234' })
        .expect(200);
      expect(res.body.data).toEqual({ deviceId: 'abcd1234', transferred: true });
      expect(deviceService.selectDevice).toHaveBeenCalledWith('user-1', 'abcd1234');
    });
  });
});
