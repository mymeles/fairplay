export const qk = {
  hostStatus: ['host', 'status'] as const,
  session: (sessionId: string) => ['session', sessionId] as const,
  sessionByCode: (code: string) => ['session', 'by-code', code] as const,
  queue: (sessionId: string) => ['session', sessionId, 'queue'] as const,
  queueEntry: (entryId: string) => ['queue', entryId] as const,
  wallet: (sessionId: string) => ['session', sessionId, 'wallet'] as const,
  search: (sessionId: string, q: string) =>
    ['session', sessionId, 'search', q] as const,
  devices: ['host', 'devices'] as const,
  playbackState: ['host', 'playback-state'] as const,
};
