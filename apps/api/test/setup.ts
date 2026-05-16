process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error';
process.env.PORT = process.env.PORT ?? '3100';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://fairplay:fairplay@localhost:5432/fairplay?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

jest.setTimeout(30_000);
