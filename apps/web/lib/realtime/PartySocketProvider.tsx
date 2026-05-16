'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import type {
  NowPlayingUpdatedPayload,
  QueueUpdatedPayload,
  RealtimeEventEnvelope,
  RealtimeEventType,
  RunnerStatusChangedPayload,
  TokenUpdatedPayload,
  TrackLockPayload,
  VoteUpdatedPayload,
} from '@fairplay/shared-types';
import { qk } from '@/lib/query/keys';
import { openPartySocket, REALTIME_EVENT_TYPES } from './socket';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

interface PartySocketContextValue {
  state: ConnectionState;
  lastEvent: RealtimeEventEnvelope | null;
  nowPlaying: NowPlayingUpdatedPayload | null;
  runnerStatus: RunnerStatusChangedPayload | null;
  lastTokenUpdate: TokenUpdatedPayload | null;
  subscribe: <T = unknown>(
    type: RealtimeEventType,
    handler: (event: RealtimeEventEnvelope<T>) => void,
  ) => () => void;
}

const PartySocketContext = createContext<PartySocketContextValue | null>(null);

interface PartySocketProviderProps {
  token: string | null;
  sessionId: string;
  role: 'host' | 'guest';
  children: ReactNode;
}

export const PartySocketProvider = ({
  token,
  sessionId,
  role,
  children,
}: PartySocketProviderProps) => {
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const listenersRef = useRef<Map<RealtimeEventType, Set<(event: RealtimeEventEnvelope) => void>>>(
    new Map(),
  );

  const [state, setState] = useState<ConnectionState>('disconnected');
  const [lastEvent, setLastEvent] = useState<RealtimeEventEnvelope | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingUpdatedPayload | null>(null);
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatusChangedPayload | null>(null);
  const [lastTokenUpdate, setLastTokenUpdate] = useState<TokenUpdatedPayload | null>(null);

  useEffect(() => {
    if (!token) {
      setState('disconnected');
      return;
    }

    setState('connecting');
    const socket = openPartySocket(token);
    socketRef.current = socket;

    const onConnect = () => {
      setState('connected');
      if (role === 'host') {
        socket.emit('host.join_session', { sessionId });
      }
    };
    const onDisconnect = () => setState('disconnected');
    const onConnectError = () => setState('error');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    const handlers: Array<[RealtimeEventType, (envelope: RealtimeEventEnvelope) => void]> = [];

    for (const type of REALTIME_EVENT_TYPES) {
      const handler = (envelope: RealtimeEventEnvelope) => {
        setLastEvent(envelope);

        switch (type) {
          case 'queue.updated': {
            const payload = envelope.payload as QueueUpdatedPayload | undefined;
            qc.invalidateQueries({ queryKey: qk.queue(sessionId) });
            if (payload?.entryId) {
              qc.invalidateQueries({ queryKey: qk.queueEntry(payload.entryId) });
            }
            break;
          }
          case 'vote.updated': {
            const payload = envelope.payload as VoteUpdatedPayload | undefined;
            qc.invalidateQueries({ queryKey: qk.queue(sessionId) });
            if (payload?.entryId) {
              qc.invalidateQueries({ queryKey: qk.queueEntry(payload.entryId) });
            }
            break;
          }
          case 'track.locked':
          case 'track.unlocked': {
            const payload = envelope.payload as TrackLockPayload | undefined;
            qc.invalidateQueries({ queryKey: qk.queue(sessionId) });
            if (payload?.entryId) {
              qc.invalidateQueries({ queryKey: qk.queueEntry(payload.entryId) });
            }
            break;
          }
          case 'token.updated': {
            const payload = envelope.payload as TokenUpdatedPayload | undefined;
            if (payload) {
              setLastTokenUpdate(payload);
              qc.invalidateQueries({ queryKey: qk.wallet(sessionId) });
            }
            break;
          }
          case 'now_playing.updated': {
            const payload = envelope.payload as NowPlayingUpdatedPayload | undefined;
            if (payload) setNowPlaying(payload);
            break;
          }
          case 'runner.status_changed': {
            const payload = envelope.payload as RunnerStatusChangedPayload | undefined;
            if (payload) setRunnerStatus(payload);
            break;
          }
          case 'track.queued_to_spotify':
            qc.invalidateQueries({ queryKey: qk.queue(sessionId) });
            break;
          case 'guest.joined':
          case 'session.updated':
          case 'session.ended':
            qc.invalidateQueries({ queryKey: qk.session(sessionId) });
            break;
          default:
            break;
        }

        const handlers = listenersRef.current.get(type);
        if (handlers) {
          for (const handler of handlers) handler(envelope);
        }
      };

      socket.on(type, handler);
      handlers.push([type, handler]);
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      for (const [type, handler] of handlers) socket.off(type, handler);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, sessionId, role, qc]);

  const value = useMemo<PartySocketContextValue>(() => {
    return {
      state,
      lastEvent,
      nowPlaying,
      runnerStatus,
      lastTokenUpdate,
      subscribe<T>(
        type: RealtimeEventType,
        handler: (event: RealtimeEventEnvelope<T>) => void,
      ) {
        let set = listenersRef.current.get(type);
        if (!set) {
          set = new Set();
          listenersRef.current.set(type, set);
        }
        set.add(handler as (event: RealtimeEventEnvelope) => void);
        return () => {
          set?.delete(handler as (event: RealtimeEventEnvelope) => void);
        };
      },
    };
  }, [state, lastEvent, nowPlaying, runnerStatus, lastTokenUpdate]);

  return (
    <PartySocketContext.Provider value={value}>{children}</PartySocketContext.Provider>
  );
};

export const usePartySocket = (): PartySocketContextValue => {
  const ctx = useContext(PartySocketContext);
  if (!ctx) {
    throw new Error('usePartySocket must be used inside <PartySocketProvider>');
  }
  return ctx;
};
