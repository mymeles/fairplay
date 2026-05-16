import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DomainExceptionFilter } from '../../common/filters/domain-exception.filter';
import { ResponseEnvelopeInterceptor } from '../../common/interceptors/response-envelope.interceptor';
import { RequestContextMiddleware } from '../../common/middleware/request-context.middleware';
import { AppConfigService } from '../config/app-config.service';
import { HostAuthGuard } from '../spotify-auth/host-auth.guard';
import { HostJwtService } from '../spotify-auth/host-jwt.service';
import { BlacklistService } from './blacklist.service';
import { GuestDisciplineService } from './guest-discipline.service';
import { ModerationController } from './moderation.controller';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const HOST_ID = '33333333-3333-3333-3333-333333333333';
const cfg = { hostJwtSecret: 's'.repeat(64) } as AppConfigService;

describe('ModerationController', () => {
  let app: INestApplication;
  let hostJwt: HostJwtService;
  let blacklists: { blacklistTrack: jest.Mock; blacklistArtist: jest.Mock };
  let discipline: { muteGuest: jest.Mock; banGuest: jest.Mock; unmuteGuest: jest.Mock };

  beforeAll(async () => {
    hostJwt = new HostJwtService(cfg);
    blacklists = { blacklistTrack: jest.fn(), blacklistArtist: jest.fn() };
    discipline = { muteGuest: jest.fn(), banGuest: jest.fn(), unmuteGuest: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [ModerationController],
      providers: [
        HostAuthGuard,
        { provide: HostJwtService, useValue: hostJwt },
        { provide: BlacklistService, useValue: blacklists },
        { provide: GuestDisciplineService, useValue: discipline },
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
    blacklists.blacklistTrack.mockReset();
    blacklists.blacklistArtist.mockReset();
    discipline.muteGuest.mockReset();
    discipline.banGuest.mockReset();
    discipline.unmuteGuest.mockReset();
  });

  const authHeader = (): string => `Bearer ${hostJwt.sign(HOST_ID)}`;

  it('401s without host auth', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/sessions/${SESSION_ID}/blacklist/track`)
      .send({ spotifyTrackId: 'abc123' })
      .expect(401);
  });

  it('blacklists a track through the service', async () => {
    blacklists.blacklistTrack.mockResolvedValueOnce({
      sessionId: SESSION_ID,
      spotifyTrackId: 'abc123',
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${SESSION_ID}/blacklist/track`)
      .set('authorization', authHeader())
      .send({ spotifyTrackId: 'abc123', title: 'Nope' })
      .expect(200);

    expect(res.body.data.spotifyTrackId).toBe('abc123');
    expect(blacklists.blacklistTrack).toHaveBeenCalledWith(
      SESSION_ID,
      HOST_ID,
      expect.objectContaining({ spotifyTrackId: 'abc123', title: 'Nope' }),
    );
  });

  it('400s on an invalid artist body', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/sessions/${SESSION_ID}/blacklist/artist`)
      .set('authorization', authHeader())
      .send({ artistName: '' })
      .expect(400);
  });

  it('mutes, bans, and unmutes guests through the service', async () => {
    discipline.muteGuest.mockResolvedValueOnce({ guest: { id: GUEST_ID, status: 'MUTED' } });
    discipline.banGuest.mockResolvedValueOnce({ guest: { id: GUEST_ID, status: 'BANNED' } });
    discipline.unmuteGuest.mockResolvedValueOnce({ guest: { id: GUEST_ID, status: 'ACTIVE' } });

    await request(app.getHttpServer())
      .post(`/api/v1/sessions/${SESSION_ID}/guests/${GUEST_ID}/mute`)
      .set('authorization', authHeader())
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/sessions/${SESSION_ID}/guests/${GUEST_ID}/ban`)
      .set('authorization', authHeader())
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/sessions/${SESSION_ID}/guests/${GUEST_ID}/mute`)
      .set('authorization', authHeader())
      .expect(200);

    expect(discipline.muteGuest).toHaveBeenCalledWith(SESSION_ID, GUEST_ID, HOST_ID);
    expect(discipline.banGuest).toHaveBeenCalledWith(SESSION_ID, GUEST_ID, HOST_ID);
    expect(discipline.unmuteGuest).toHaveBeenCalledWith(SESSION_ID, GUEST_ID, HOST_ID);
  });
});
