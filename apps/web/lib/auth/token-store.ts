const HOST_KEY = 'fairplay.host.jwt';
const HOST_USER_KEY = 'fairplay.host.userId';
const GUEST_KEY_PREFIX = 'fairplay.guest.jwt.';
const GUEST_META_KEY_PREFIX = 'fairplay.guest.meta.';

const ssrSafe = (): Storage | null =>
  typeof window === 'undefined' ? null : window.localStorage;

export interface GuestMeta {
  guestId: string;
  sessionId: string;
  displayName: string;
}

export const hostTokenStore = {
  read(): string | null {
    return ssrSafe()?.getItem(HOST_KEY) ?? null;
  },
  write(token: string, userId: string): void {
    const ls = ssrSafe();
    if (!ls) return;
    ls.setItem(HOST_KEY, token);
    ls.setItem(HOST_USER_KEY, userId);
  },
  userId(): string | null {
    return ssrSafe()?.getItem(HOST_USER_KEY) ?? null;
  },
  clear(): void {
    const ls = ssrSafe();
    if (!ls) return;
    ls.removeItem(HOST_KEY);
    ls.removeItem(HOST_USER_KEY);
  },
};

export const guestTokenStore = {
  read(sessionId: string): string | null {
    return ssrSafe()?.getItem(GUEST_KEY_PREFIX + sessionId) ?? null;
  },
  meta(sessionId: string): GuestMeta | null {
    const raw = ssrSafe()?.getItem(GUEST_META_KEY_PREFIX + sessionId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GuestMeta;
    } catch {
      return null;
    }
  },
  write(sessionId: string, token: string, meta: GuestMeta): void {
    const ls = ssrSafe();
    if (!ls) return;
    ls.setItem(GUEST_KEY_PREFIX + sessionId, token);
    ls.setItem(GUEST_META_KEY_PREFIX + sessionId, JSON.stringify(meta));
  },
  clear(sessionId: string): void {
    const ls = ssrSafe();
    if (!ls) return;
    ls.removeItem(GUEST_KEY_PREFIX + sessionId);
    ls.removeItem(GUEST_META_KEY_PREFIX + sessionId);
  },
  listSessions(): string[] {
    const ls = ssrSafe();
    if (!ls) return [];
    const sessions: string[] = [];
    for (let i = 0; i < ls.length; i += 1) {
      const key = ls.key(i);
      if (key && key.startsWith(GUEST_KEY_PREFIX)) {
        sessions.push(key.slice(GUEST_KEY_PREFIX.length));
      }
    }
    return sessions;
  },
};
