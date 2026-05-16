import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_SESSION_SETTINGS,
  type ScoringWeights,
  type SessionSettings,
} from '@fairplay/shared-types';
import { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import { SessionRepository } from '../sessions/session.repository';
import { SessionService } from '../sessions/session.service';

// What the controller hands us: every field optional, including every key
// inside `scoring`. Matches UpdateSessionSettingsDto structurally.
export type SessionSettingsPatch = {
  [K in keyof SessionSettings]?: K extends 'scoring'
    ? Partial<ScoringWeights>
    : SessionSettings[K];
};

export interface UpdateSettingsResult {
  sessionId: string;
  settings: SessionSettings;
}

@Injectable()
export class SessionSettingsService {
  private readonly logger = new Logger(SessionSettingsService.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly sessionRepo: SessionRepository,
    @Optional() private readonly realtime?: RealtimeEventPublisher,
  ) {}

  async updateSettings(
    sessionId: string,
    hostUserId: string,
    patch: SessionSettingsPatch,
  ): Promise<UpdateSettingsResult> {
    // Ownership check — getSession throws FORBIDDEN/NOT_FOUND.
    const current = await this.sessions.getSession(sessionId, hostUserId);

    // Merge: skip explicit undefined so a DTO with all-optional fields
    // doesn't blow away configured values. Scoring is a nested object that
    // needs a deep-merge step.
    const merged: SessionSettings = {
      ...DEFAULT_SESSION_SETTINGS,
      ...current.settings,
    };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || k === 'scoring') continue;
      (merged as unknown as Record<string, unknown>)[k] = v;
    }
    if (patch.scoring) {
      merged.scoring = {
        ...DEFAULT_SCORING_WEIGHTS,
        ...current.settings.scoring,
        ...Object.fromEntries(
          Object.entries(patch.scoring).filter(([, v]) => v !== undefined),
        ),
      };
    }

    const updated = await this.sessionRepo.updateSettings(sessionId, merged);
    this.logger.log(
      { sessionId, hostUserId, changed: Object.keys(patch) },
      'Session settings updated.',
    );

    // Publish so clients can refresh display state (e.g. lockSize moved,
    // proximityRequired flipped). The payload mirrors the persisted shape.
    this.realtime?.publishSessionUpdated(sessionId, {
      sessionId,
      settings: updated.settings,
    });

    return { sessionId, settings: updated.settings };
  }
}
