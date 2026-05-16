import { Injectable } from '@nestjs/common';
import { AppEnv, envSchema } from './env.schema';

@Injectable()
export class AppConfigService {
  private readonly env: AppEnv;

  constructor(source: NodeJS.ProcessEnv = process.env) {
    const parsed = envSchema.safeParse(source);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    this.env = parsed.data;
  }

  get nodeEnv(): AppEnv['NODE_ENV'] {
    return this.env.NODE_ENV;
  }

  get port(): number {
    return this.env.PORT;
  }

  get logLevel(): AppEnv['LOG_LEVEL'] {
    return this.env.LOG_LEVEL;
  }

  get databaseUrl(): string {
    return this.env.DATABASE_URL;
  }

  get redisUrl(): string {
    return this.env.REDIS_URL;
  }

  get supabaseUrl(): string {
    return this.env.SUPABASE_URL;
  }

  get supabaseServiceRoleKey(): string {
    return this.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  get spotifyClientId(): string {
    return this.env.SPOTIFY_CLIENT_ID;
  }

  get spotifyRedirectUri(): string {
    return this.env.SPOTIFY_REDIRECT_URI;
  }

  get tokenEncryptionKey(): Buffer {
    return Buffer.from(this.env.TOKEN_ENCRYPTION_KEY, 'base64');
  }

  get hostJwtSecret(): string {
    return this.env.HOST_JWT_SECRET;
  }

  get webAuthCompleteUrl(): string {
    return this.env.WEB_AUTH_COMPLETE_URL;
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get runnerEnabled(): boolean {
    return this.env.RUNNER_ENABLED;
  }

  get runnerTickMs(): number {
    return this.env.RUNNER_TICK_MS;
  }

  get nowPlayingEnabled(): boolean {
    return this.env.NOW_PLAYING_ENABLED;
  }

  get nowPlayingTickMs(): number {
    return this.env.NOW_PLAYING_TICK_MS;
  }
}
