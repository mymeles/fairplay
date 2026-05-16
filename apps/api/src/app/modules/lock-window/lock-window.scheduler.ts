import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LockWindowService } from './lock-window.service';
import { SessionService } from '../sessions/session.service';

const LOCK_WINDOW_TICK_MS = 10_000;

export interface LockWindowSchedulerResult {
  sessionsProcessed: number;
  locked: number;
  released: number;
}

@Injectable()
export class LockWindowScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LockWindowScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly sessions: SessionService,
    private readonly locks: LockWindowService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.runOnce().catch((err) => {
        this.logger.error({ err }, 'Lock-window scheduler tick failed.');
      });
    }, LOCK_WINDOW_TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(now: Date = new Date()): Promise<LockWindowSchedulerResult> {
    if (this.running) {
      this.logger.warn('Skipped overlapping lock-window scheduler tick.');
      return { sessionsProcessed: 0, locked: 0, released: 0 };
    }

    this.running = true;
    try {
      const sessionIds = await this.sessions.listActiveSessionIds(now);
      let locked = 0;
      let released = 0;

      for (const sessionId of sessionIds) {
        try {
          const result = await this.locks.processSession(sessionId, now);
          locked += result.locked;
          released += result.released;
        } catch (err) {
          this.logger.warn({ err, sessionId }, 'Lock-window session processing failed.');
        }
      }

      if (locked > 0 || released > 0) {
        this.logger.log(
          { sessionsProcessed: sessionIds.length, locked, released },
          'Lock-window scheduler tick completed.',
        );
      }

      return { sessionsProcessed: sessionIds.length, locked, released };
    } finally {
      this.running = false;
    }
  }
}
