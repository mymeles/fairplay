import { Injectable, Logger, Optional } from '@nestjs/common';
import type { QueueEntryStatus } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import {
  QueueEntryRecord,
  QueueEntryRepository,
} from '../queue/queue-entry.repository';
import { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import { ScoreRebuildService } from '../scoring/score-rebuild.service';
import { RunnerStateService } from '../runner/runner-state.service';
import { SessionService } from '../sessions/session.service';

export interface PinResult {
  entryId: string;
  hostPinned: boolean;
  score: number;
  status: QueueEntryStatus;
}

export interface RunnerToggleResult {
  sessionId: string;
  enabled: boolean;
  state: ReturnType<RunnerStateService['snapshot']>['status'];
}

// Pin/unpin only makes sense for entries that are still in the active queue
// loop. Played / removed / vetoed rows are historical.
const PINNABLE_STATUSES = new Set<QueueEntryStatus>(['PENDING', 'LOCKED']);

@Injectable()
export class HostControlService {
  private readonly logger = new Logger(HostControlService.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly entries: QueueEntryRepository,
    private readonly scoreRebuild: ScoreRebuildService,
    private readonly runnerState: RunnerStateService,
    @Optional() private readonly realtime?: RealtimeEventPublisher,
  ) {}

  async pinEntry(entryId: string, hostUserId: string): Promise<PinResult> {
    return this.togglePin(entryId, hostUserId, true);
  }

  async unpinEntry(entryId: string, hostUserId: string): Promise<PinResult> {
    return this.togglePin(entryId, hostUserId, false);
  }

  async startRunner(sessionId: string, hostUserId: string): Promise<RunnerToggleResult> {
    // Session ownership check — throws FORBIDDEN if not the host.
    await this.sessions.getSession(sessionId, hostUserId);
    this.runnerState.enable(sessionId);
    const snap = this.runnerState.snapshot(sessionId);
    this.logger.log({ sessionId, hostUserId }, 'Runner started by host.');
    return { sessionId, enabled: true, state: snap.status };
  }

  async stopRunner(sessionId: string, hostUserId: string): Promise<RunnerToggleResult> {
    await this.sessions.getSession(sessionId, hostUserId);
    this.runnerState.disable(sessionId, 'host_disabled');
    const snap = this.runnerState.snapshot(sessionId);
    this.logger.log({ sessionId, hostUserId }, 'Runner stopped by host.');
    return { sessionId, enabled: false, state: snap.status };
  }

  private async togglePin(
    entryId: string,
    hostUserId: string,
    nextPinned: boolean,
  ): Promise<PinResult> {
    const entry = await this.entries.findById(entryId);
    if (!entry) {
      throw new DomainError('NOT_FOUND', 'Queue entry not found.');
    }
    // getSession throws if hostUserId doesn't own this session — keeps the
    // auth check in one place rather than duplicating it across pin paths.
    await this.sessions.getSession(entry.sessionId, hostUserId);

    if (!PINNABLE_STATUSES.has(entry.status)) {
      throw new DomainError(
        'CONFLICT',
        `Cannot pin/unpin a ${entry.status} queue entry.`,
        { status: entry.status },
      );
    }

    if (entry.hostPinned === nextPinned) {
      // Idempotent — still recompute score so any drift gets fixed up, but
      // skip the publish.
      return this.toPinResult(entry);
    }

    await this.entries.setHostPinned(entry.id, nextPinned);
    // The scoring formula reads hostPinned; recalc immediately so the ZSET
    // reflects the new rank.
    const recalculated = await this.scoreRebuild.recalculateEntry(entry.id);

    this.realtime?.publishQueueUpdated(entry.sessionId, {
      reason: nextPinned ? 'host_pinned' : 'host_unpinned',
      entryId: recalculated.id,
      status: recalculated.status,
    });

    this.logger.log(
      {
        sessionId: entry.sessionId,
        hostUserId,
        entryId: recalculated.id,
        hostPinned: nextPinned,
        score: recalculated.score,
      },
      nextPinned ? 'Queue entry pinned.' : 'Queue entry unpinned.',
    );

    return this.toPinResult(recalculated, nextPinned);
  }

  private toPinResult(entry: QueueEntryRecord, hostPinned?: boolean): PinResult {
    return {
      entryId: entry.id,
      hostPinned: hostPinned ?? entry.hostPinned,
      score: entry.score,
      status: entry.status,
    };
  }
}
