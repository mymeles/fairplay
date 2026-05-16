import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { SessionService } from '../sessions/session.service';
import { NowPlayingResult, NowPlayingService } from './now-playing.service';

export interface PlaybackPollerTickResult {
  startedAt: string;
  finishedAt: string;
  sessionsConsidered: number;
  transitions: number;
  results: NowPlayingResult[];
}

const TRANSITION_OUTCOMES = new Set<NowPlayingResult['outcome']>([
  'transitioned_playing',
  'completed_previous',
]);

@Injectable()
export class PlaybackPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlaybackPoller.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly sessions: SessionService,
    private readonly nowPlaying: NowPlayingService,
  ) {}

  onModuleInit(): void {
    if (!this.config.nowPlayingEnabled) {
      this.logger.warn(
        { nowPlayingEnabled: false },
        'Now-playing poller disabled. Set NOW_PLAYING_ENABLED=true to track playback.',
      );
      return;
    }
    const tickMs = this.config.nowPlayingTickMs;
    this.logger.log({ tickMs }, 'Now-playing poller started.');
    this.timer = setInterval(() => {
      void this.runOnce().catch((err) => {
        this.logger.error({ err }, 'Now-playing poller tick failed.');
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

  async runOnce(now: Date = new Date()): Promise<PlaybackPollerTickResult> {
    if (this.ticking) {
      this.logger.warn('Skipped overlapping now-playing tick.');
      return {
        startedAt: now.toISOString(),
        finishedAt: now.toISOString(),
        sessionsConsidered: 0,
        transitions: 0,
        results: [],
      };
    }
    this.ticking = true;
    const startedAt = new Date();
    const results: NowPlayingResult[] = [];
    let transitions = 0;

    try {
      const sessionIds = await this.sessions.listActiveSessionIds(now);
      for (const sessionId of sessionIds) {
        try {
          const result = await this.nowPlaying.syncSession(sessionId);
          results.push(result);
          if (TRANSITION_OUTCOMES.has(result.outcome)) transitions += 1;
        } catch (err) {
          this.logger.warn({ err, sessionId }, 'Now-playing session sync threw.');
        }
      }
      if (transitions > 0) {
        this.logger.log(
          { sessionsConsidered: sessionIds.length, transitions },
          'Now-playing tick produced status transitions.',
        );
      }
      return {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        sessionsConsidered: sessionIds.length,
        transitions,
        results,
      };
    } finally {
      this.ticking = false;
    }
  }
}
