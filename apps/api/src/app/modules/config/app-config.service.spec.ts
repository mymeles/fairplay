import { AppConfigService } from './app-config.service';

const validEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-1234567890',
  SPOTIFY_CLIENT_ID: 'spotify-client-id',
  SPOTIFY_REDIRECT_URI: 'https://example.supabase.co/functions/v1/spotify-callback',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  HOST_JWT_SECRET: 'a'.repeat(64),
  WEB_AUTH_COMPLETE_URL: 'http://localhost:3001/auth/complete',
} satisfies NodeJS.ProcessEnv;

describe('AppConfigService', () => {
  it('loads required values and applies defaults', () => {
    const config = new AppConfigService({ ...validEnv });
    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
    expect(config.databaseUrl).toBe(validEnv.DATABASE_URL);
    expect(config.redisUrl).toBe(validEnv.REDIS_URL);
    expect(config.supabaseUrl).toBe(validEnv.SUPABASE_URL);
    expect(config.spotifyClientId).toBe(validEnv.SPOTIFY_CLIENT_ID);
    expect(config.spotifyRedirectUri).toBe(validEnv.SPOTIFY_REDIRECT_URI);
    expect(config.tokenEncryptionKey).toHaveLength(32);
    expect(config.hostJwtSecret).toBe(validEnv.HOST_JWT_SECRET);
    expect(config.webAuthCompleteUrl).toBe(validEnv.WEB_AUTH_COMPLETE_URL);
    expect(config.isProduction).toBe(false);
  });

  it('flags isProduction when NODE_ENV=production', () => {
    const config = new AppConfigService({ ...validEnv, NODE_ENV: 'production' });
    expect(config.isProduction).toBe(true);
  });

  it('coerces PORT to a number', () => {
    const config = new AppConfigService({ ...validEnv, PORT: '4242' });
    expect(config.port).toBe(4242);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(
      () => new AppConfigService({ ...validEnv, DATABASE_URL: undefined as unknown as string }),
    ).toThrow(/Invalid environment/);
  });

  it('throws when REDIS_URL is malformed', () => {
    expect(() => new AppConfigService({ ...validEnv, REDIS_URL: 'not-a-url' })).toThrow(
      /Invalid environment/,
    );
  });

  it('throws when LOG_LEVEL is not one of the allowed values', () => {
    expect(() => new AppConfigService({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrow(
      /Invalid environment/,
    );
  });

  it('throws when TOKEN_ENCRYPTION_KEY is shorter than 32 decoded bytes', () => {
    expect(
      () =>
        new AppConfigService({
          ...validEnv,
          TOKEN_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString('base64'),
        }),
    ).toThrow(/Invalid environment/);
  });

  it('throws when HOST_JWT_SECRET is too short', () => {
    expect(
      () => new AppConfigService({ ...validEnv, HOST_JWT_SECRET: 'too-short' }),
    ).toThrow(/Invalid environment/);
  });
});
