import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_SESSION_SETTINGS,
  SessionPublicSummary,
  SessionSettings,
  SessionSummary,
  SessionVenue,
} from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import { UserRepository } from '../spotify-auth/user.repository';
import { JoinCodeService } from './join-code.service';
import { QrTokenService } from './qr-token.service';
import { PartySessionRecord, SessionRepository } from './session.repository';

const DEFAULT_TTL_HOURS = 12;

export interface CreateSessionInputExtras {
  settingsOverride?: Partial<SessionSettings>;
  venue?: SessionVenue;
  venueWifiHash?: string;
}

export interface CreateSessionResult {
  session: SessionSummary;
  joinCode: string;
  qrToken: string;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly sessions: SessionRepository,
    private readonly joinCodes: JoinCodeService,
    private readonly qrTokens: QrTokenService,
    private readonly users: UserRepository,
  ) {}

  async createSession(
    hostUserId: string,
    extras: CreateSessionInputExtras = {},
  ): Promise<CreateSessionResult> {
    // Merge defaults with the override, skipping explicit `undefined` keys.
    // class-transformer instantiates the DTO with every declared field, so
    // a naive `{...DEFAULTS, ...override}` would overwrite our defaults with
    // undefined and JSON.stringify would then drop them entirely, persisting
    // a half-populated settings_json.
    const settings: SessionSettings = { ...DEFAULT_SESSION_SETTINGS };
    if (extras.settingsOverride) {
      for (const [k, v] of Object.entries(extras.settingsOverride)) {
        if (v !== undefined) {
          (settings as unknown as Record<string, unknown>)[k] = v;
        }
      }
    }

    // Inherit the host's previously selected device so the session has a
    // sensible default; the host can change it via Milestone 03 endpoints
    // and (in M14) per-session.
    const user = await this.users.findById(hostUserId);
    const selectedDeviceId = user?.selectedDeviceId ?? null;

    const joinCode = await this.joinCodes.generateUnique();
    const qr = this.qrTokens.generate();

    const expiresAt = new Date(Date.now() + DEFAULT_TTL_HOURS * 60 * 60 * 1000);

    const record = await this.sessions.create({
      hostUserId,
      joinCode,
      qrTokenHash: qr.tokenHash,
      selectedSpotifyDeviceId: selectedDeviceId,
      settings,
      expiresAt,
      venueLat: extras.venue?.lat ?? null,
      venueLng: extras.venue?.lng ?? null,
      venueRadiusMeters: extras.venue?.radiusMeters ?? null,
      venueWifiHash: extras.venueWifiHash ?? null,
    });

    this.logger.log(
      {
        sessionId: record.id,
        hostUserId,
        joinCode,
        hasVenueGps: extras.venue !== undefined,
        hasVenueWifi: extras.venueWifiHash !== undefined,
        proximityRequired: settings.proximityRequired,
      },
      'Session created.',
    );

    return {
      session: this.toSummary(record),
      joinCode,
      qrToken: qr.token,
    };
  }

  async getSession(sessionId: string, hostUserId: string): Promise<SessionSummary> {
    const record = await this.requireOwned(sessionId, hostUserId);
    return this.toSummary(record);
  }

  async getPublicByCode(joinCode: string): Promise<SessionPublicSummary> {
    const record = await this.sessions.findActiveByJoinCode(joinCode);
    if (!record) {
      throw new DomainError('NOT_FOUND', 'No active session matches that join code.');
    }
    if (this.isExpired(record)) {
      throw new DomainError('SESSION_EXPIRED', 'This session has expired.');
    }
    return {
      id: record.id,
      joinCode: record.joinCode,
      status: record.status,
      expiresAt: record.expiresAt.toISOString(),
    };
  }

  async endSession(sessionId: string, hostUserId: string): Promise<SessionSummary> {
    const record = await this.requireOwned(sessionId, hostUserId);
    if (record.status === 'ENDED') {
      // End is idempotent — repeated calls just return the current state.
      return this.toSummary(record);
    }
    const updated = await this.sessions.markEnded(sessionId);
    this.logger.log({ sessionId, hostUserId }, 'Session ended.');
    return this.toSummary(updated);
  }

  // Used by GuestService during the join flow.
  async loadJoinable(sessionId: string): Promise<PartySessionRecord> {
    const record = await this.sessions.findById(sessionId);
    if (!record) {
      throw new DomainError('NOT_FOUND', 'Session not found.');
    }
    if (record.status === 'ENDED') {
      throw new DomainError('SESSION_EXPIRED', 'This session has ended.');
    }
    if (this.isExpired(record)) {
      throw new DomainError('SESSION_EXPIRED', 'This session has expired.');
    }
    if (record.status !== 'ACTIVE') {
      throw new DomainError('FORBIDDEN', `Session is ${record.status}; cannot join right now.`);
    }
    return record;
  }

  async listActiveSessionIds(now: Date = new Date()): Promise<string[]> {
    return this.sessions.listActiveIds(now);
  }

  private async requireOwned(sessionId: string, hostUserId: string): Promise<PartySessionRecord> {
    const record = await this.sessions.findById(sessionId);
    if (!record) {
      throw new DomainError('NOT_FOUND', 'Session not found.');
    }
    if (record.hostUserId !== hostUserId) {
      throw new DomainError('FORBIDDEN', 'You do not own this session.');
    }
    return record;
  }

  private isExpired(record: PartySessionRecord): boolean {
    return record.expiresAt.getTime() <= Date.now();
  }

  private toSummary(record: PartySessionRecord): SessionSummary {
    const venue: SessionVenue | null =
      record.venueLat !== null && record.venueLng !== null && record.venueRadiusMeters !== null
        ? { lat: record.venueLat, lng: record.venueLng, radiusMeters: record.venueRadiusMeters }
        : null;
    return {
      id: record.id,
      hostUserId: record.hostUserId,
      joinCode: record.joinCode,
      status: record.status,
      selectedSpotifyDeviceId: record.selectedSpotifyDeviceId,
      settings: record.settings,
      venue,
      hasVenueWifi: record.venueWifiHash !== null,
      createdAt: record.createdAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      endedAt: record.endedAt ? record.endedAt.toISOString() : null,
    };
  }
}
