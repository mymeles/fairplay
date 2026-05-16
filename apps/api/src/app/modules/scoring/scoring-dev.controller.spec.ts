import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DomainExceptionFilter } from '../../common/filters/domain-exception.filter';
import { ResponseEnvelopeInterceptor } from '../../common/interceptors/response-envelope.interceptor';
import { RequestContextMiddleware } from '../../common/middleware/request-context.middleware';
import { AppConfigService } from '../config/app-config.service';
import { ScoreRebuildService } from './score-rebuild.service';
import { ScoringDevController } from './scoring-dev.controller';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';

const bootstrap = async (isProduction: boolean): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({
    controllers: [ScoringDevController],
    providers: [
      {
        provide: ScoreRebuildService,
        useValue: {
          recalculateSession: jest.fn().mockResolvedValue({
            sessionId: SESSION_ID,
            recalculated: 3,
            pendingInZset: 2,
          }),
        },
      },
      { provide: AppConfigService, useValue: { isProduction } as AppConfigService },
    ],
  }).compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });
  const middleware = new RequestContextMiddleware();
  app.use(middleware.use.bind(middleware));
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.init();
  return app;
};

describe('ScoringDevController', () => {
  it('rebuilds scores and returns the result in non-prod', async () => {
    const app = await bootstrap(false);
    try {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/dev/sessions/${SESSION_ID}/recalculate-scores`)
        .expect(202);
      expect(res.body.data).toEqual({
        sessionId: SESSION_ID,
        recalculated: 3,
        pendingInZset: 2,
      });
    } finally {
      await app.close();
    }
  });

  it('refuses in production', async () => {
    const app = await bootstrap(true);
    try {
      await request(app.getHttpServer())
        .post(`/api/v1/dev/sessions/${SESSION_ID}/recalculate-scores`)
        .expect(403);
    } finally {
      await app.close();
    }
  });

  it('400s on a malformed session uuid', async () => {
    const app = await bootstrap(false);
    try {
      await request(app.getHttpServer())
        .post('/api/v1/dev/sessions/not-a-uuid/recalculate-scores')
        .expect(400);
    } finally {
      await app.close();
    }
  });
});
