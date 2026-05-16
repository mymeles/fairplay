import type {
  GuestSummary,
  GuestWalletSummary,
  ProximityResult,
  QueueEntryDto,
  SessionPublicSummary,
  SessionSummary,
  TrackDto,
} from '@fairplay/shared-types';
import { apiFetch } from './client';

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const apiHealth = () => apiFetch<{ status: string }>({ path: '/health' });

// ---------------------------------------------------------------------------
// Host auth
// ---------------------------------------------------------------------------

export interface SpotifyLoginInfo {
  authorizeUrl: string;
  state: string;
  expiresAt: string;
}

export const spotifyLoginUrl = (redirectTo?: string): string =>
  redirectTo
    ? `/auth/spotify/login?redirectTo=${encodeURIComponent(redirectTo)}`
    : '/auth/spotify/login';

export const spotifyLoginJson = (redirectTo?: string) =>
  apiFetch<SpotifyLoginInfo>({
    path: '/auth/spotify/login',
    query: { json: '1', redirectTo },
  });

export interface HostStatus {
  connected: boolean;
  scopes: string[];
  expiresAt: string | null;
  refreshDue: boolean;
}

export const hostStatus = () =>
  apiFetch<HostStatus>({ path: '/auth/spotify/status', auth: 'host' });

export const hostLogout = () =>
  apiFetch<{ removed: boolean }>({
    path: '/auth/spotify/logout',
    method: 'POST',
    auth: 'host',
  });

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface CreateSessionBody {
  settings?: Partial<{
    lockSize: number;
    lockDurationSeconds: number;
    spotifyQueueDepthTarget: number;
    initialBoostTokens: number;
    initialChallengeTokens: number;
    allowExplicitTracks: boolean;
    duplicateCooldownSeconds: number;
    maxSuggestionsPerGuest: number;
    proximityRequired: boolean;
  }>;
  venue?: { lat: number; lng: number; radiusMeters: number };
  venueWifiHash?: string;
}

export interface CreateSessionResult {
  session: SessionSummary;
  joinCode: string;
  qrToken: string;
}

export const createSession = (body: CreateSessionBody) =>
  apiFetch<CreateSessionResult>({
    path: '/sessions',
    method: 'POST',
    body,
    auth: 'host',
  });

export const getSession = (sessionId: string) =>
  apiFetch<SessionSummary>({ path: `/sessions/${sessionId}`, auth: 'host' });

export const lookupSessionByCode = (joinCode: string) =>
  apiFetch<SessionPublicSummary>({ path: `/sessions/by-code/${joinCode}` });

export interface JoinSessionBody {
  displayName: string;
  joinCode?: string;
  qrToken?: string;
  deviceHash?: string;
  location?: { lat: number; lng: number; accuracyMeters: number };
  wifiHash?: string;
}

export interface JoinSessionResult {
  guest: GuestSummary;
  wallet: GuestWalletSummary;
  token: string;
  sessionId: string;
  proximity: ProximityResult;
}

export const joinSession = (sessionId: string, body: JoinSessionBody) =>
  apiFetch<JoinSessionResult>({
    path: `/sessions/${sessionId}/join`,
    method: 'POST',
    body,
  });

export const endSession = (sessionId: string) =>
  apiFetch<{ sessionId: string; status: string; endedAt: string }>({
    path: `/sessions/${sessionId}/end`,
    method: 'POST',
    auth: 'host',
  });

export interface UpdateSessionSettingsBody {
  lockSize?: number;
  lockDurationSeconds?: number;
  spotifyQueueDepthTarget?: number;
  allowExplicitTracks?: boolean;
  duplicateCooldownSeconds?: number;
  maxSuggestionsPerGuest?: number;
  proximityRequired?: boolean;
}

export const patchSessionSettings = (
  sessionId: string,
  body: UpdateSessionSettingsBody,
) =>
  apiFetch<SessionSummary>({
    path: `/sessions/${sessionId}/settings`,
    method: 'PATCH',
    body,
    auth: 'host',
  });

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export const searchTracks = (sessionId: string, q: string, signal?: AbortSignal) =>
  apiFetch<TrackDto[]>({
    path: `/sessions/${sessionId}/search`,
    query: { q },
    auth: 'guest',
    sessionId,
    signal,
  });

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export interface AddQueueEntryBody {
  spotifyTrackId?: string;
  spotifyUri?: string;
}

export const addQueueEntry = (sessionId: string, body: AddQueueEntryBody) =>
  apiFetch<QueueEntryDto>({
    path: `/sessions/${sessionId}/queue`,
    method: 'POST',
    body,
    auth: 'guest',
    sessionId,
  });

export const listQueue = (sessionId: string) =>
  apiFetch<QueueEntryDto[]>({
    path: `/sessions/${sessionId}/queue`,
    auth: 'guest',
    sessionId,
  });

export const hostListQueue = (sessionId: string) =>
  apiFetch<QueueEntryDto[]>({
    path: `/sessions/${sessionId}/host/queue`,
    auth: 'host',
  });

export const removeOwnQueueEntry = (sessionId: string, entryId: string) =>
  apiFetch<QueueEntryDto>({
    path: `/queue/${entryId}`,
    method: 'DELETE',
    auth: 'guest',
    sessionId,
  });

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

export const castVote = (sessionId: string, entryId: string, value: 1 | -1) =>
  apiFetch<{ entryId: string; value: 1 | -1 }>({
    path: `/queue/${entryId}/vote`,
    method: 'POST',
    body: { value },
    auth: 'guest',
    sessionId,
  });

export const removeVote = (sessionId: string, entryId: string) =>
  apiFetch<{ entryId: string }>({
    path: `/queue/${entryId}/vote`,
    method: 'DELETE',
    auth: 'guest',
    sessionId,
  });

// ---------------------------------------------------------------------------
// Tokens / wallet / boost / challenge
// ---------------------------------------------------------------------------

export const getGuestWallet = (sessionId: string) =>
  apiFetch<GuestWalletSummary>({
    path: '/guests/me/wallet',
    auth: 'guest',
    sessionId,
  });

export const applyBoost = (sessionId: string, entryId: string) =>
  apiFetch<QueueEntryDto>({
    path: `/queue/${entryId}/apply-boost`,
    method: 'POST',
    auth: 'guest',
    sessionId,
  });

export const challengeLock = (sessionId: string, entryId: string) =>
  apiFetch<QueueEntryDto>({
    path: `/queue/${entryId}/challenge-lock`,
    method: 'POST',
    auth: 'guest',
    sessionId,
  });

export const hostGrantTokens = (
  sessionId: string,
  guestId: string,
  body: { boostTokens?: number; challengeTokens?: number },
) =>
  apiFetch<GuestWalletSummary>({
    path: `/sessions/${sessionId}/guests/${guestId}/grant-tokens`,
    method: 'POST',
    body,
    auth: 'host',
  });

// ---------------------------------------------------------------------------
// Host control (pin/veto/runner)
// ---------------------------------------------------------------------------

export const hostPinEntry = (entryId: string) =>
  apiFetch<QueueEntryDto>({ path: `/queue/${entryId}/pin`, method: 'POST', auth: 'host' });

export const hostUnpinEntry = (entryId: string) =>
  apiFetch<QueueEntryDto>({ path: `/queue/${entryId}/unpin`, method: 'POST', auth: 'host' });

export const hostVetoEntry = (entryId: string) =>
  apiFetch<QueueEntryDto>({ path: `/queue/${entryId}/veto`, method: 'POST', auth: 'host' });

export const hostStartRunner = (sessionId: string) =>
  apiFetch<{ runnerEnabled: boolean }>({
    path: `/sessions/${sessionId}/runner/start`,
    method: 'POST',
    auth: 'host',
  });

export const hostStopRunner = (sessionId: string) =>
  apiFetch<{ runnerEnabled: boolean }>({
    path: `/sessions/${sessionId}/runner/stop`,
    method: 'POST',
    auth: 'host',
  });

// ---------------------------------------------------------------------------
// Spotify devices
// ---------------------------------------------------------------------------

export interface SpotifyDeviceInfo {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isRestricted: boolean;
  volumePercent: number | null;
}

export const listSpotifyDevices = () =>
  apiFetch<{ devices: SpotifyDeviceInfo[]; selectedDeviceId: string | null }>({
    path: '/host/spotify/devices',
    auth: 'host',
  });

export const getSpotifyPlaybackState = () =>
  apiFetch<{
    deviceId: string | null;
    isPlaying: boolean;
    progressMs: number | null;
    track: { uri: string; name: string; artists: string[] } | null;
  }>({ path: '/host/spotify/playback-state', auth: 'host' });

export const selectSpotifyDevice = (deviceId: string) =>
  apiFetch<{ selectedDeviceId: string }>({
    path: '/host/spotify/device/select',
    method: 'POST',
    body: { deviceId },
    auth: 'host',
  });

export const hostSkip = () =>
  apiFetch<{ ok: true }>({ path: '/host/spotify/skip', method: 'POST', auth: 'host' });

export const hostPause = () =>
  apiFetch<{ ok: true }>({ path: '/host/spotify/pause', method: 'POST', auth: 'host' });

export const hostResume = () =>
  apiFetch<{ ok: true }>({ path: '/host/spotify/resume', method: 'POST', auth: 'host' });

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export const blacklistTrack = (
  sessionId: string,
  body: { spotifyTrackId?: string; spotifyUri?: string; title?: string },
) =>
  apiFetch<{ id: string }>({
    path: `/sessions/${sessionId}/blacklist/track`,
    method: 'POST',
    body,
    auth: 'host',
  });

export const blacklistArtist = (sessionId: string, body: { artistName: string }) =>
  apiFetch<{ id: string }>({
    path: `/sessions/${sessionId}/blacklist/artist`,
    method: 'POST',
    body,
    auth: 'host',
  });

export const muteGuest = (sessionId: string, guestId: string) =>
  apiFetch<{ guestId: string; status: string }>({
    path: `/sessions/${sessionId}/guests/${guestId}/mute`,
    method: 'POST',
    auth: 'host',
  });

export const banGuest = (sessionId: string, guestId: string) =>
  apiFetch<{ guestId: string; status: string }>({
    path: `/sessions/${sessionId}/guests/${guestId}/ban`,
    method: 'POST',
    auth: 'host',
  });

export const unmuteGuest = (sessionId: string, guestId: string) =>
  apiFetch<{ guestId: string; status: string }>({
    path: `/sessions/${sessionId}/guests/${guestId}/mute`,
    method: 'DELETE',
    auth: 'host',
  });
