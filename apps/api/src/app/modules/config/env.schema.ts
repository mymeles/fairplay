import { z } from 'zod';

const base64String = (label: string, minBytes: number) =>
  z.string().refine(
    (v) => {
      try {
        return Buffer.from(v, 'base64').length >= minBytes;
      } catch {
        return false;
      }
    },
    { message: `${label} must be base64-encoded and decode to at least ${minBytes} bytes` },
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  DATABASE_URL: z.string().url().or(z.string().startsWith('postgresql://')),
  REDIS_URL: z.string().url().or(z.string().startsWith('redis://')),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  SPOTIFY_CLIENT_ID: z.string().min(8),
  SPOTIFY_REDIRECT_URI: z.string().url(),

  TOKEN_ENCRYPTION_KEY: base64String('TOKEN_ENCRYPTION_KEY', 32),
  HOST_JWT_SECRET: z.string().min(32),

  WEB_AUTH_COMPLETE_URL: z.string().url(),

  // M12 — runner ships disabled by default. Production turns it on with
  // RUNNER_ENABLED=true after verifying the host's Spotify connection. Tests
  // and the dev API stay quiet unless you opt in.
  RUNNER_ENABLED: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1'))
    .default(false),

  // Tick interval for the runner loop. Lower = faster recovery from new
  // votes; higher = less Spotify request volume. Default 5s matches the
  // SPOTIFY_INTEGRATION_RULES guidance.
  RUNNER_TICK_MS: z.coerce.number().int().min(1000).max(60_000).default(5000),

  // M13 — now-playing poller. Default off in dev so a developer running the
  // API doesn't ping Spotify with the host token. Production turns it on
  // alongside RUNNER_ENABLED.
  NOW_PLAYING_ENABLED: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1'))
    .default(false),

  // Slightly slower than the runner — track progress reporting only needs
  // sub-10s freshness. Lower bound is generous because Spotify rate-limits
  // GET /me/player at ~1 req/sec per token.
  NOW_PLAYING_TICK_MS: z.coerce.number().int().min(1500).max(60_000).default(6000),
});

export type AppEnv = z.infer<typeof envSchema>;
