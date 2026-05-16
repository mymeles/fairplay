import type { SessionService } from '../sessions/session.service';
import type { LockWindowService } from './lock-window.service';
import { LockWindowScheduler } from './lock-window.scheduler';

const SESSION_1 = '11111111-1111-1111-1111-111111111111';
const SESSION_2 = '22222222-2222-2222-2222-222222222222';
const NOW = new Date('2026-01-01T00:00:00.000Z');

describe('LockWindowScheduler.runOnce', () => {
  it('processes active sessions and returns aggregate counts', async () => {
    const sessions = {
      listActiveSessionIds: jest.fn().mockResolvedValue([SESSION_1, SESSION_2]),
    } as unknown as jest.Mocked<SessionService>;
    const locks = {
      processSession: jest
        .fn()
        .mockResolvedValueOnce({ sessionId: SESSION_1, locked: 2, released: 0 })
        .mockResolvedValueOnce({ sessionId: SESSION_2, locked: 0, released: 1 }),
    } as unknown as jest.Mocked<LockWindowService>;
    const scheduler = new LockWindowScheduler(sessions, locks);

    const result = await scheduler.runOnce(NOW);

    expect(sessions.listActiveSessionIds).toHaveBeenCalledWith(NOW);
    expect(locks.processSession).toHaveBeenCalledWith(SESSION_1, NOW);
    expect(locks.processSession).toHaveBeenCalledWith(SESSION_2, NOW);
    expect(result).toEqual({ sessionsProcessed: 2, locked: 2, released: 1 });
  });

  it('continues when one session fails', async () => {
    const sessions = {
      listActiveSessionIds: jest.fn().mockResolvedValue([SESSION_1, SESSION_2]),
    } as unknown as jest.Mocked<SessionService>;
    const locks = {
      processSession: jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ sessionId: SESSION_2, locked: 1, released: 0 }),
    } as unknown as jest.Mocked<LockWindowService>;
    const scheduler = new LockWindowScheduler(sessions, locks);

    const result = await scheduler.runOnce(NOW);

    expect(result).toEqual({ sessionsProcessed: 2, locked: 1, released: 0 });
  });
});
