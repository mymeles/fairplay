export const partyRoom = (sessionId: string): string => `party:${sessionId}`;
export const hostRoom = (sessionId: string): string => `host:${sessionId}`;
export const guestRoom = (guestId: string): string => `guest:${guestId}`;
