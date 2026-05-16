import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DomainExceptionFilter } from '../../common/filters/domain-exception.filter';
import { ResponseEnvelopeInterceptor } from '../../common/interceptors/response-envelope.interceptor';
import { RequestContextMiddleware } from '../../common/middleware/request-context.middleware';
import { AppConfigService } from '../config/app-config.service';
import { GuestAuthGuard } from '../guests/guest-auth.guard';
import { GuestJwtService } from '../guests/guest-jwt.service';
import { VoteController } from './vote.controller';
import { VoteService } from './vote.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const ENTRY_ID = '33333333-3333-3333-3333-333333333333';
const cfg = { hostJwtSecret: 's'.repeat(64) } as AppConfigService;

const voteResult = {
  vote: {
    id: '55555555-5555-5555-5555-555555555555',
    entryId: ENTRY_ID,
    guestId: GUEST_ID,
    value: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  entry: { id: ENTRY_ID, upvotes: 1, downvotes: 0, score: 1, status: 'PENDING' as const },
};

describe('VoteController', () => {
  let app: INestApplication;
  let guestJwt: GuestJwtService;
  let voteService: { castVote: jest.Mock; removeVote: jest.Mock };

  beforeAll(async () => {
    guestJwt = new GuestJwtService(cfg);
    voteService = { castVote: jest.fn(), removeVote: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [VoteController],
      providers: [
        GuestAuthGuard,
        { provide: GuestJwtService, useValue: guestJwt },
        { provide: VoteService, useValue: voteService },
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
    voteService.castVote.mockReset();
    voteService.removeVote.mockReset();
  });

  const authHeader = (sessionId = SESSION_ID): string =>
    `Bearer ${guestJwt.sign(GUEST_ID, sessionId)}`;

  describe('POST /api/v1/queue/:entryId/vote', () => {
    it('401s without a guest token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/queue/${ENTRY_ID}/vote`)
        .send({ value: 1 })
        .expect(401);
    });

    it('400s when value is not ±1', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/queue/${ENTRY_ID}/vote`)
        .set('authorization', authHeader())
        .send({ value: 7 })
        .expect(400);
    });

    it('400s when entryId is not a uuid', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/queue/not-a-uuid/vote')
        .set('authorization', authHeader())
        .send({ value: 1 })
        .expect(400);
    });

    it('records the vote and returns the new entry counters', async () => {
      voteService.castVote.mockResolvedValueOnce(voteResult);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/queue/${ENTRY_ID}/vote`)
        .set('authorization', authHeader())
        .send({ value: 1 })
        .expect(200);
      expect(res.body.data).toEqual(voteResult);
      expect(voteService.castVote).toHaveBeenCalledWith(ENTRY_ID, GUEST_ID, SESSION_ID, 1);
    });
  });

  describe('DELETE /api/v1/queue/:entryId/vote', () => {
    it('401s without a guest token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/queue/${ENTRY_ID}/vote`)
        .expect(401);
    });

    it('returns the updated entry counters after removal', async () => {
      voteService.removeVote.mockResolvedValueOnce({
        vote: null,
        entry: { id: ENTRY_ID, upvotes: 0, downvotes: 0, score: 0, status: 'PENDING' as const },
      });
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/queue/${ENTRY_ID}/vote`)
        .set('authorization', authHeader())
        .expect(200);
      expect(res.body.data.vote).toBeNull();
      expect(res.body.data.entry.upvotes).toBe(0);
      expect(voteService.removeVote).toHaveBeenCalledWith(ENTRY_ID, GUEST_ID, SESSION_ID);
    });
  });
});
