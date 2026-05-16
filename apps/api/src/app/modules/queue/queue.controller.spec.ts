import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { QueueEntryDto } from '@fairplay/shared-types';
import { DomainExceptionFilter } from '../../common/filters/domain-exception.filter';
import { ResponseEnvelopeInterceptor } from '../../common/interceptors/response-envelope.interceptor';
import { RequestContextMiddleware } from '../../common/middleware/request-context.middleware';
import { AppConfigService } from '../config/app-config.service';
import { GuestAuthGuard } from '../guests/guest-auth.guard';
import { GuestJwtService } from '../guests/guest-jwt.service';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_SESSION_ID = '99999999-9999-9999-9999-999999999999';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const ENTRY_ID = '33333333-3333-3333-3333-333333333333';
const cfg = { hostJwtSecret: 's'.repeat(64) } as AppConfigService;

const queueEntry: QueueEntryDto = {
  id: ENTRY_ID,
  sessionId: SESSION_ID,
  trackId: '44444444-4444-4444-4444-444444444444',
  addedByGuestId: GUEST_ID,
  status: 'PENDING',
  upvotes: 0,
  downvotes: 0,
  boostCredits: 0,
  score: 0,
  lockedUntil: null,
  hostPinned: false,
  spotifyQueuedAt: null,
  playingAt: null,
  playedAt: null,
  removedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  track: {
    spotifyUri: 'spotify:track:abc123',
    spotifyTrackId: 'abc123',
    title: 'Levitating',
    artist: 'Dua Lipa',
    album: 'Future Nostalgia',
    durationMs: 203_807,
    artworkUrl: 'https://i.scdn.co/image/large',
    explicit: false,
  },
};

const addBody = {
  id: 'abc123',
  uri: 'spotify:track:abc123',
  name: 'Levitating',
  artists: [{ name: 'Dua Lipa' }],
  album: {
    name: 'Future Nostalgia',
    images: [{ url: 'https://i.scdn.co/image/large', width: 640, height: 640 }],
  },
  duration_ms: 203_807,
  explicit: false,
};

describe('QueueController', () => {
  let app: INestApplication;
  let guestJwt: GuestJwtService;
  let queueService: {
    addTrack: jest.Mock;
    listSession: jest.Mock;
    removeOwnEntry: jest.Mock;
  };

  beforeAll(async () => {
    guestJwt = new GuestJwtService(cfg);
    queueService = {
      addTrack: jest.fn(),
      listSession: jest.fn(),
      removeOwnEntry: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [QueueController],
      providers: [
        GuestAuthGuard,
        { provide: GuestJwtService, useValue: guestJwt },
        { provide: QueueService, useValue: queueService },
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
    queueService.addTrack.mockReset();
    queueService.listSession.mockReset();
    queueService.removeOwnEntry.mockReset();
  });

  const authHeader = (sessionId = SESSION_ID): string =>
    `Bearer ${guestJwt.sign(GUEST_ID, sessionId)}`;

  describe('POST /api/v1/sessions/:sessionId/queue', () => {
    it('401s without a guest token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/sessions/${SESSION_ID}/queue`)
        .send(addBody)
        .expect(401);
    });

    it('rejects a token scoped to a different session', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${SESSION_ID}/queue`)
        .set('authorization', authHeader(OTHER_SESSION_ID))
        .send(addBody)
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(queueService.addTrack).not.toHaveBeenCalled();
    });

    it('validates the Spotify-like body', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${SESSION_ID}/queue`)
        .set('authorization', authHeader())
        .send({ ...addBody, uri: 'nope' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('persists the queue entry and returns the created DTO', async () => {
      queueService.addTrack.mockResolvedValueOnce(queueEntry);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sessions/${SESSION_ID}/queue`)
        .set('authorization', authHeader())
        .send(addBody)
        .expect(201);

      expect(res.body.data).toEqual(queueEntry);
      expect(queueService.addTrack).toHaveBeenCalledWith(
        SESSION_ID,
        GUEST_ID,
        expect.objectContaining({ id: 'abc123', uri: 'spotify:track:abc123' }),
      );
    });
  });

  describe('GET /api/v1/sessions/:sessionId/queue', () => {
    it('401s without a guest token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/sessions/${SESSION_ID}/queue`)
        .expect(401);
    });

    it('forbids cross-session reads', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sessions/${SESSION_ID}/queue`)
        .set('authorization', authHeader(OTHER_SESSION_ID))
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns the queue list for this session', async () => {
      queueService.listSession.mockResolvedValueOnce([queueEntry]);
      const res = await request(app.getHttpServer())
        .get(`/api/v1/sessions/${SESSION_ID}/queue`)
        .set('authorization', authHeader())
        .expect(200);
      expect(res.body.data).toEqual([queueEntry]);
      expect(queueService.listSession).toHaveBeenCalledWith(SESSION_ID, GUEST_ID);
    });
  });

  describe('DELETE /api/v1/queue/:entryId', () => {
    it('401s without a guest token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/queue/${ENTRY_ID}`)
        .expect(401);
    });

    it('400s on a malformed entry uuid', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/queue/not-a-uuid')
        .set('authorization', authHeader())
        .expect(400);
    });

    it('removes the entry and returns the updated DTO', async () => {
      queueService.removeOwnEntry.mockResolvedValueOnce({
        ...queueEntry,
        status: 'REMOVED',
        removedAt: '2026-01-01T00:00:01.000Z',
      });
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/queue/${ENTRY_ID}`)
        .set('authorization', authHeader())
        .expect(200);
      expect(res.body.data.status).toBe('REMOVED');
      expect(queueService.removeOwnEntry).toHaveBeenCalledWith(ENTRY_ID, GUEST_ID);
    });
  });
});
