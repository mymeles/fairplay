import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TrackDto } from '@fairplay/shared-types';
import { DomainExceptionFilter } from '../../common/filters/domain-exception.filter';
import { ResponseEnvelopeInterceptor } from '../../common/interceptors/response-envelope.interceptor';
import { RequestContextMiddleware } from '../../common/middleware/request-context.middleware';
import { AppConfigService } from '../config/app-config.service';
import { GuestAuthGuard } from '../guests/guest-auth.guard';
import { GuestJwtService } from '../guests/guest-jwt.service';
import { HostAuthGuard } from '../spotify-auth/host-auth.guard';
import { HostJwtService } from '../spotify-auth/host-jwt.service';
import { TrackController } from './track.controller';
import { TrackSearchService } from './track-search.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_SESSION_ID = '99999999-9999-9999-9999-999999999999';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const HOST_ID = '33333333-3333-3333-3333-333333333333';
const cfg = { hostJwtSecret: 's'.repeat(64) } as AppConfigService;

const track: TrackDto = {
  spotifyUri: 'spotify:track:abc123',
  spotifyTrackId: 'abc123',
  title: 'Levitating',
  artist: 'Dua Lipa',
  album: 'Future Nostalgia',
  durationMs: 203807,
  artworkUrl: 'https://i.scdn.co/image/large',
  explicit: false,
};

describe('TrackController', () => {
  let app: INestApplication;
  let guestJwt: GuestJwtService;
  let hostJwt: HostJwtService;
  let trackService: { search: jest.Mock; searchForHost: jest.Mock; normalizeTrack: jest.Mock };

  beforeAll(async () => {
    guestJwt = new GuestJwtService(cfg);
    hostJwt = new HostJwtService(cfg);
    trackService = {
      search: jest.fn(),
      searchForHost: jest.fn(),
      normalizeTrack: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TrackController],
      providers: [
        GuestAuthGuard,
        HostAuthGuard,
        { provide: GuestJwtService, useValue: guestJwt },
        { provide: HostJwtService, useValue: hostJwt },
        { provide: TrackSearchService, useValue: trackService },
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
    trackService.search.mockReset();
    trackService.searchForHost.mockReset();
    trackService.normalizeTrack.mockReset();
  });

  const authHeader = (sessionId = SESSION_ID): string =>
    `Bearer ${guestJwt.sign(GUEST_ID, sessionId)}`;
  const hostAuthHeader = (): string => `Bearer ${hostJwt.sign(HOST_ID)}`;

  describe('GET /api/v1/sessions/:sessionId/search', () => {
    it('401s without a guest token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/sessions/${SESSION_ID}/search?q=dua`)
        .expect(401);
    });

    it('rejects a token scoped to a different session', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sessions/${SESSION_ID}/search?q=dua`)
        .set('authorization', authHeader(OTHER_SESSION_ID))
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(trackService.search).not.toHaveBeenCalled();
    });

    it('rejects an empty query', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sessions/${SESSION_ID}/search?q=%20%20`)
        .set('authorization', authHeader())
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns normalized tracks for the guest session', async () => {
      trackService.search.mockResolvedValueOnce([track]);
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sessions/${SESSION_ID}/search?q=dua`)
        .set('authorization', authHeader())
        .expect(200);

      expect(res.body.data).toEqual([track]);
      expect(trackService.search).toHaveBeenCalledWith(SESSION_ID, GUEST_ID, 'dua');
    });
  });

  describe('GET /api/v1/sessions/:sessionId/host/search', () => {
    it('returns normalized tracks for the owning host session', async () => {
      trackService.searchForHost.mockResolvedValueOnce([track]);
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sessions/${SESSION_ID}/host/search?q=dua`)
        .set('authorization', hostAuthHeader())
        .expect(200);

      expect(res.body.data).toEqual([track]);
      expect(trackService.searchForHost).toHaveBeenCalledWith(SESSION_ID, HOST_ID, 'dua');
    });
  });

  describe('POST /api/v1/tracks/normalize', () => {
    const body = {
      id: 'abc123',
      uri: 'spotify:track:abc123',
      name: 'Levitating',
      artists: [{ name: 'Dua Lipa' }],
      album: {
        name: 'Future Nostalgia',
        images: [{ url: 'https://i.scdn.co/image/large', width: 640, height: 640 }],
      },
      duration_ms: 203807,
      explicit: false,
    };

    it('401s without a guest token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tracks/normalize')
        .send(body)
        .expect(401);
    });

    it('validates the Spotify-like track body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tracks/normalize')
        .set('authorization', authHeader())
        .send({ ...body, uri: 'nope' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('normalizes and stores through the guest session from the JWT', async () => {
      trackService.normalizeTrack.mockResolvedValueOnce(track);
      const res = await request(app.getHttpServer())
        .post('/api/v1/tracks/normalize')
        .set('authorization', authHeader())
        .send(body)
        .expect(200);

      expect(res.body.data).toEqual(track);
      expect(trackService.normalizeTrack).toHaveBeenCalledWith(
        SESSION_ID,
        GUEST_ID,
        expect.objectContaining({ id: 'abc123', uri: 'spotify:track:abc123' }),
      );
    });
  });
});
