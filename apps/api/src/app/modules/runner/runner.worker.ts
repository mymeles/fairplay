import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { SessionService } from '../sessions/session.service';
import { QueueDispatchService, type DispatchResult } from './queue-dispatch.service';

export interface RunnerTickResult {
  startedAt: string;
  finishedAt: string;
  sessionsConsidered: number;
  dispatched: number;
  results: DispatchResult[];
}

@Injectable()
export class RunnerWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunnerWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly sessions: SessionService,
    private readonly dispatch: QueueDispatchService,
  ) {}

  onModuleInit(): void {
    if (!this.config.runnerEnabled) {
      this.logger.warn(
        { runnerEnabled: false },
        'Spotify queue runner is disabled. Set RUNNER_ENABLED=true to dispatch tracks.',
      );
      return;
    }

    const tickMs = this.config.runnerTickMs;
    this.logger.log({ tickMs }, 'Spotify queue runner started.');
    this.timer = setInterval(() => {
      void this.runOnce().catch((err) => {
        this.logger.error({ err }, 'Runner tick failed.');
      });
    }, tickMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // Public for tests + the optional future dev recalc endpoint. The
  // `ticking` guard prevents a slow Spotify call from causing two ticks to
  // overlap and double-dispatch.
  async runOnce(now: Date = new Date()): Promise<RunnerTickResult> {
    if (this.ticking) {
      this.logger.warn('Skipped overlapping runner tick.');
      return {
        startedAt: now.toISOString(),
        finishedAt: now.toISOString(),
        sessionsConsidered: 0,
        dispatched: 0,
        results: [],
      };
    }
    this.ticking = true;
    const startedAt = new Date();
    const results: DispatchResult[] = [];
    let dispatched = 0;

    try {
      const sessionIds = await this.sessions.listActiveSessionIds(now);
      for (const sessionId of sessionIds) {
        try {
          const result = await this.dispatch.dispatchNextForSession(sessionId, now);
          results.push(result);
          if (result.outcome === 'dispatched' || result.outcome === 'fallback_dispatched') {
            dispatched += 1;
          }
        } catch (err) {
          this.logger.warn({ err, sessionId }, 'Runner session dispatch threw.');
        }
      }
      if (dispatched > 0) {
        this.logger.log(
          { sessionsConsidered: sessionIds.length, dispatched },
          'Runner tick dispatched tracks.',
        );
      }
      return {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        sessionsConsidered: sessionIds.length,
        dispatched,
        results,
      };
    } finally {
      this.ticking = false;
    }
  }
}
