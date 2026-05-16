import { io, type Socket } from 'socket.io-client';
import type { RealtimeEventEnvelope, RealtimeEventType } from '@fairplay/shared-types';

const REALTIME_URL =
  process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:3000';
const REALTIME_NAMESPACE = '/party';

export const openPartySocket = (token: string): Socket => {
  return io(`${REALTIME_URL}${REALTIME_NAMESPACE}`, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
};

export type RealtimeListener<T = unknown> = (event: RealtimeEventEnvelope<T>) => void;

export const REALTIME_EVENT_TYPES: RealtimeEventType[] = [
  'session.updated',
  'guest.joined',
  'queue.updated',
  'vote.updated',
  'track.locked',
  'track.unlocked',
  'token.updated',
  'track.queued_to_spotify',
  'now_playing.updated',
  'runner.status_changed',
  'session.ended',
];
