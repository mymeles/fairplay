import type { GuestId, SessionId, UserId } from './ids';

export type SessionStatus = 'ACTIVE' | 'PAUSED' | 'ENDED' | 'EXPIRED';
export type GuestStatus = 'ACTIVE' | 'MUTED' | 'BANNED' | 'LEFT';
export type GuestRole = 'GUEST' | 'HOST_ATTENDEE';

// Weights for the M09 scoring engine. Per-session so a host can tune
// aggression without redeploying. Defaults match
// `03_milestones/MILESTONE_09_SCORING_ENGINE.md`.
export interface ScoringWeights {
  upvoteWeight: number;
  downvoteWeight: number;
  boostWeight: number;
  ageWeight: number;
  hostPinWeight: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  upvoteWeight: 2,
  downvoteWeight: 1,
  boostWeight: 3,
  ageWeight: 0.05,
  hostPinWeight: 1000,
};

// Defaults pinned by 03_milestones/MILESTONE_04_..., echoed here so the API
// and the frontend share one source of truth for what a session ships with.
export interface SessionSettings {
  lockSize: number;
  lockDurationSeconds: number;
  spotifyQueueDepthTarget: number;
  initialBoostTokens: number;
  initialChallengeTokens: number;
  allowExplicitTracks: boolean;
  duplicateCooldownSeconds: number;
  maxSuggestionsPerGuest: number;
  proximityRequired: boolean;
  scoring: ScoringWeights;
}

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  lockSize: 2,
  lockDurationSeconds: 90,
  spotifyQueueDepthTarget: 1,
  initialBoostTokens: 3,
  initialChallengeTokens: 1,
  allowExplicitTracks: true,
  duplicateCooldownSeconds: 900,
  maxSuggestionsPerGuest: 10,
  proximityRequired: false,
  scoring: DEFAULT_SCORING_WEIGHTS,
};

export interface SessionVenue {
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface SessionSummary {
  id: SessionId;
  hostUserId: UserId;
  joinCode: string;
  status: SessionStatus;
  selectedSpotifyDeviceId: string | null;
  settings: SessionSettings;
  venue: SessionVenue | null;
  // Whether the host registered a venue Wi-Fi fingerprint. The hash itself
  // is never returned over the wire.
  hasVenueWifi: boolean;
  createdAt: string;
  expiresAt: string;
  endedAt: string | null;
}

// Public projection a guest can see *before* joining — never include settings
// or the qrToken because both are sensitive (settings can leak host config,
// qrToken is the join secret).
export interface SessionPublicSummary {
  id: SessionId;
  joinCode: string;
  status: SessionStatus;
  expiresAt: string;
}

export interface GuestSummary {
  id: GuestId;
  sessionId: SessionId;
  displayName: string;
  role: GuestRole;
  status: GuestStatus;
  joinedAt: string;
}

export interface GuestWalletSummary {
  guestId: GuestId;
  sessionId: SessionId;
  boostTokens: number;
  challengeTokens: number;
}

// Names match the milestone-doc signal list; weights are defined in the
// scorer and may be tuned without changing this enum.
export type JoinTrustReason =
  | 'qrTokenValid'
  | 'qrTokenInvalid'
  | 'joinCodeValid'
  | 'joinCodeInvalid'
  | 'gpsWithinRadius'
  | 'gpsOutsideRadius'
  | 'gpsMissing'
  | 'noVenueGps'
  | 'wifiHashMatch'
  | 'wifiHashMismatch'
  | 'wifiMissing'
  | 'noVenueWifi'
  | 'lowRiskDevice'
  | 'unknownDevice';

export interface ProximityResult {
  allowed: boolean;
  score: number;
  threshold: number;
  reasons: JoinTrustReason[];
  // distance is null when guest didn't supply GPS or session has no venue.
  distanceMeters: number | null;
}
