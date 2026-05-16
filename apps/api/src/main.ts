import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app/app.module';
import { AppConfigService } from './app/modules/config/app-config.service';
import { DomainExceptionFilter } from './app/common/filters/domain-exception.filter';
import { ResponseEnvelopeInterceptor } from './app/common/interceptors/response-envelope.interceptor';
import { getAllowedCorsOrigins } from './app/common/cors-origins';

async function bootstrap(): Promise<void> {
  // Disable bufferLogs in production so module-init failures (e.g. a Postgres
  // or Redis connection error in OnModuleInit) print to stdout instead of
  // disappearing into the buffer when the process crashes.
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.useLogger(app.get(Logger));

  // CORS: allow local dev UIs and the configured web app origin to call the API.
  app.enableCors({
    origin: getAllowedCorsOrigins(),
    credentials: false,
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.useGlobalFilters(new DomainExceptionFilter());

  const config = app.get(AppConfigService);
  const port = config.port;

  // Bind to 0.0.0.0 so platforms (Railway, Render, etc.) can reach the
  // process via their healthcheck — the default `127.0.0.1` would only
  // accept loopback traffic inside the container.
  await app.listen(port, '0.0.0.0');
  app.get(Logger).log(`FairPlay API listening on :${port} (env=${config.nodeEnv})`);
}

console.log('[boot] FairPlay API starting…');
bootstrap().catch((err) => {
  console.error('[boot] Fatal startup error:', err);
  process.exit(1);
});
