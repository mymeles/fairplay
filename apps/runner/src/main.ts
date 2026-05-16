import pino from 'pino';

// Milestone 1 runner is a long-running placeholder. The real BullMQ worker that
// pushes eligible internal queue entries into the host's Spotify queue is added
// in Milestone 12 (Spotify Queue Runner). Keeping a heartbeat here lets Docker
// Compose, observability, and deployment infra be wired up earlier.

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { singleLine: true } },
});

const HEARTBEAT_INTERVAL_MS = 30_000;

function main(): void {
  log.info({ service: 'fairplay-runner' }, 'Runner placeholder started.');

  const heartbeat = setInterval(() => {
    log.debug({ service: 'fairplay-runner' }, 'Runner heartbeat — no work configured yet.');
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  const shutdown = (signal: string): void => {
    log.info({ signal }, 'Runner shutting down.');
    clearInterval(heartbeat);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
