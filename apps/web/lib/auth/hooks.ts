'use client';

import { useCallback, useEffect, useState } from 'react';
import { guestTokenStore, hostTokenStore, type GuestMeta } from './token-store';

export interface HostAuthState {
  token: string | null;
  userId: string | null;
  ready: boolean;
}

export const useHostAuth = (): HostAuthState & {
  setHost: (token: string, userId: string) => void;
  clear: () => void;
} => {
  const [state, setState] = useState<HostAuthState>({
    token: null,
    userId: null,
    ready: false,
  });

  useEffect(() => {
    setState({ token: hostTokenStore.read(), userId: hostTokenStore.userId(), ready: true });
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key.startsWith('fairplay.host')) {
        setState({
          token: hostTokenStore.read(),
          userId: hostTokenStore.userId(),
          ready: true,
        });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setHost = useCallback((token: string, userId: string) => {
    hostTokenStore.write(token, userId);
    setState({ token, userId, ready: true });
  }, []);

  const clear = useCallback(() => {
    hostTokenStore.clear();
    setState({ token: null, userId: null, ready: true });
  }, []);

  return { ...state, setHost, clear };
};

export interface GuestAuthState {
  token: string | null;
  meta: GuestMeta | null;
  ready: boolean;
}

export const useGuestAuth = (sessionId: string): GuestAuthState & {
  setGuest: (token: string, meta: GuestMeta) => void;
  clear: () => void;
} => {
  const [state, setState] = useState<GuestAuthState>({
    token: null,
    meta: null,
    ready: false,
  });

  useEffect(() => {
    setState({
      token: guestTokenStore.read(sessionId),
      meta: guestTokenStore.meta(sessionId),
      ready: true,
    });
  }, [sessionId]);

  const setGuest = useCallback(
    (token: string, meta: GuestMeta) => {
      guestTokenStore.write(sessionId, token, meta);
      setState({ token, meta, ready: true });
    },
    [sessionId],
  );

  const clear = useCallback(() => {
    guestTokenStore.clear(sessionId);
    setState({ token: null, meta: null, ready: true });
  }, [sessionId]);

  return { ...state, setGuest, clear };
};
