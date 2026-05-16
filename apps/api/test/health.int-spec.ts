import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';
import { DomainExceptionFilter } from '../src/app/common/filters/domain-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/app/common/interceptors/response-envelope.interceptor';

// Integration tests boot the full Nest application against the dependencies
// declared in docker-compose (Postgres + Redis). They are not unit tests —
// run `docker compose up postgres redis` first, then `npm run test:integration`.

describe('Health endpoints (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
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

  it('GET /api/v1/health returns ok with a request id', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.service).toBe('fairplay-api');
    expect(res.body.meta.requestId).toMatch(/^req_/);
  });

  it('GET /api/v1/health/db reports postgres reachability', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/db').expect(200);
    expect(res.body.data.dependency).toBe('postgres');
    expect(['ok', 'down']).toContain(res.body.data.status);
    if (res.body.data.status === 'ok') {
      expect(typeof res.body.data.latencyMs).toBe('number');
    }
  });

  it('GET /api/v1/health/redis reports redis reachability', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/redis').expect(200);
    expect(res.body.data.dependency).toBe('redis');
    expect(['ok', 'down']).toContain(res.body.data.status);
    if (res.body.data.status === 'ok') {
      expect(typeof res.body.data.latencyMs).toBe('number');
    }
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.requestId).toMatch(/^req_/);
  });
});
