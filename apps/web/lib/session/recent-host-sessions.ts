import type { SessionSummary } from '@fairplay/shared-types';

const RECENT_HOST_SESSIONS_KEY = 'fairplay.host.recentSessions.v1';
const MAX_RECENT_SESSIONS = 5;

export interface RecentHostSession {
  id: string;
  name?: string | null;
  joinCode: string;
  status: string;
  expiresAt: string;
  updatedAt: string;
}

const safeStorage = (): Storage | null =>
  typeof window === 'undefined' ? null : window.localStorage;

export const readRecentHostSessions = (): RecentHostSession[] => {
  const raw = safeStorage()?.getItem(RECENT_HOST_SESSIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentHostSession).filter((session) => !isExpired(session.expiresAt));
  } catch {
    return [];
  }
};

const isExpired = (expiresAt: string): boolean => {
  const expires = new Date(expiresAt).getTime();
  return Number.isFinite(expires) && expires <= Date.now();
};

export const rememberHostSession = (session: SessionSummary): RecentHostSession[] => {
  const next: RecentHostSession = {
    id: session.id,
    name: session.name,
    joinCode: session.joinCode,
    status: session.status,
    expiresAt: session.expiresAt,
    updatedAt: new Date().toISOString(),
  };
  const remaining = readRecentHostSessions().filter((item) => item.id !== session.id);
  const sessions = [next, ...remaining].slice(0, MAX_RECENT_SESSIONS);
  safeStorage()?.setItem(RECENT_HOST_SESSIONS_KEY, JSON.stringify(sessions));
  return sessions;
};

const isRecentHostSession = (value: unknown): value is RecentHostSession => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof RecentHostSession, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    (candidate.name === null || typeof candidate.name === 'string' || candidate.name === undefined) &&
    typeof candidate.joinCode === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.expiresAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
};
