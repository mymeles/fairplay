import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppConfigService } from '../config/app-config.service';
import { DomainExceptionFilter } from '../../common/filters/domain-exception.filter';
import { ResponseEnvelopeInterceptor } from '../../common/interceptors/response-envelope.interceptor';
import { RequestContextMiddleware } from '../../common/middleware/request-context.middleware';
import { HostJwtService } from './host-jwt.service';
import { HostAuthGuard } from './host-auth.guard';
import { OAuthStateRepository } from './oauth-state.repository';
import { SpotifyAuthController } from './spotify-auth.controller';
import { SpotifyAuthService } from './spotify-auth.service';
import { SpotifyTokenRepository } from './spotify-token.repository';

const validConfig = {
  spotifyClientId: 'cid',
  spotifyRedirectUri: 'https://example.supabase.co/functions/v1/spotify-callback',
  hostJwtSecret: 's'.repeat(64),
} as AppConfigService;

describe('SpotifyAuthController', () => {
  let app: INestApplication;
  let oauthStates: { create: jest.Mock; deleteExpired: jest.Mock };
  let tokens: { findByUserId: jest.Mock; deleteByUserId: jest.Mock };
  let hostJwt: HostJwtService;

  beforeAll(async () => {
    oauthStates = {
      create: jest.fn().mockResolvedValue({
        state: 'STATE',
        codeVerifier: 'V',
        redirectTo: null,
        expiresAt: new Date('2099-01-01T00:00:00Z'),
      }),
      deleteExpired: jest.fn(),
    };
    tokens = {
      findByUserId: jest.fn().mockResolvedValue(null),
      deleteByUserId: jest.fn().mockResolvedValue(true),
    };

    hostJwt = new HostJwtService(validConfig);

    const moduleRef = await Test.createTestingModule({
      controllers: [SpotifyAuthController],
      providers: [
        SpotifyAuthService,
        HostAuthGuard,
        { provide: AppConfigService, useValue: validConfig },
        { provide: HostJwtService, useValue: hostJwt },
        { provide: OAuthStateRepository, useValue: oauthStates },
        { provide: SpotifyTokenRepository, useValue: tokens },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.use(new RequestContextMiddleware().use.bind(new RequestContextMiddleware()));
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

  describe('GET /api/v1/auth/spotify/login', () => {
    it('returns JSON with authorize URL when json=1', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/spotify/login?json=1')
        .expect(200);

      expect(res.body.data.authorizeUrl).toMatch(/^https:\/\/accounts\.spotify\.com\/authorize/);
      expect(res.body.data.state).toBeTruthy();
      expect(oauthStates.create).toHaveBeenCalled();
    });

    it('302 redirects to Spotify when json is not set', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/spotify/login').expect(302);
      expect(res.headers.location).toMatch(/^https:\/\/accounts\.spotify\.com\/authorize/);
    });

    it('rejects a malformed redirectTo parameter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/spotify/login?redirectTo=not-a-url')
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /api/v1/auth/spotify/status', () => {
    it('401s without bearer token', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/spotify/status').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns disconnected when no token row exists', async () => {
      tokens.findByUserId.mockResolvedValueOnce(null);
      const token = hostJwt.sign('user-1');
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/spotify/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.connected).toBe(false);
    });

    it('returns connected with scopes when a token row exists', async () => {
      tokens.findByUserId.mockResolvedValueOnce({
        userId: 'user-1',
        encryptedRefreshToken: 'cipher',
        encryptedAccessToken: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        scopes: ['user-read-playback-state'],
        updatedAt: new Date(),
      });
      const token = hostJwt.sign('user-1');
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/spotify/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.connected).toBe(true);
      expect(res.body.data.scopes).toEqual(['user-read-playback-state']);
    });
  });

  describe('POST /api/v1/auth/spotify/logout', () => {
    it('401s without bearer token', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/spotify/logout').expect(401);
    });

    it('removes the token row for the authenticated host', async () => {
      tokens.deleteByUserId.mockResolvedValueOnce(true);
      const token = hostJwt.sign('user-1');
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/spotify/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.removed).toBe(true);
      expect(tokens.deleteByUserId).toHaveBeenCalledWith('user-1');
    });
  });
});
