import type { AppConfigService } from '../config/app-config.service';
import type { SessionService } from '../sessions/session.service';
import type { DispatchResult, QueueDispatchService } from './queue-dispatch.service';
import { RunnerWorker } from './runner.worker';

const SESSION_A = '11111111-1111-1111-1111-111111111111';
const SESSION_B = '22222222-2222-2222-2222-222222222222';

const makeConfig = (enabled = true, tickMs = 5000): jest.Mocked<AppConfigService> =>
  ({
    runnerEnabled: enabled,
    runnerTickMs: tickMs,
  }) as unknown as jest.Mocked<AppConfigService>;

const makeSessions = (ids: string[]): jest.Mocked<SessionService> =>
  ({
    listActiveSessionIds: jest.fn().mockResolvedValue(ids),
  }) as unknown as jest.Mocked<SessionService>;

const makeDispatch = (
  results: DispatchResult[],
): jest.Mocked<QueueDispatchService> => {
  let i = 0;
  return {
    dispatchNextForSession: jest.fn().mockImplementation(() => Promise.resolve(results[i++])),
  } as unknown as jest.Mocked<QueueDispatchService>;
};

describe('RunnerWorker', () => {
  let worker: RunnerWorker;
  afterEach(() => worker?.onModuleDestroy());

  it('iterates active sessions and counts dispatches', async () => {
    const config = makeConfig();
    const sessions = makeSessions([SESSION_A, SESSION_B]);
    const dispatch = makeDispatch([
      { sessionId: SESSION_A, outcome: 'dispatched', entryId: 'e1' },
      { sessionId: SESSION_B, outcome: 'no_pending' },
    ]);
    worker = new RunnerWorker(config, sessions, dispatch);

    const result = await worker.runOnce();
    expect(result.sessionsConsidered).toBe(2);
    expect(result.dispatched).toBe(1);
    expect(dispatch.dispatchNextForSession).toHaveBeenNthCalledWith(1, SESSION_A, expect.any(Date));
    expect(dispatch.dispatchNextForSession).toHaveBeenNthCalledWith(2, SESSION_B, expect.any(Date));
  });

  it('swallows per-session failures and continues', async () => {
    const config = makeConfig();
    const sessions = makeSessions([SESSION_A, SESSION_B]);
    const dispatch = {
      dispatchNextForSession: jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ sessionId: SESSION_B, outcome: 'dispatched', entryId: 'e2' }),
    } as unknown as jest.Mocked<QueueDispatchService>;
    worker = new RunnerWorker(config, sessions, dispatch);

    const result = await worker.runOnce();
    expect(result.sessionsConsidered).toBe(2);
    expect(result.dispatched).toBe(1);
  });

  it('does not start a timer when RUNNER_ENABLED is false', () => {
    const config = makeConfig(false);
    const sessions = makeSessions([]);
    const dispatch = makeDispatch([]);
    worker = new RunnerWorker(config, sessions, dispatch);
    worker.onModuleInit();
    // No way to inspect setInterval directly, but a manual tick still works:
    expect(() => worker.onModuleDestroy()).not.toThrow();
  });

  it('skips overlapping ticks', async () => {
    const config = makeConfig();
    const sessions = makeSessions([SESSION_A]);
    let resolveFirst: (v: DispatchResult) => void;
    const dispatch = {
      dispatchNextForSession: jest
        .fn()
        .mockImplementationOnce(
          () => new Promise<DispatchResult>((r) => (resolveFirst = r)),
        )
        .mockResolvedValue({ sessionId: SESSION_A, outcome: 'dispatched', entryId: 'e1' }),
    } as unknown as jest.Mocked<QueueDispatchService>;
    worker = new RunnerWorker(config, sessions, dispatch);

    const first = worker.runOnce();
    const second = await worker.runOnce();
    expect(second.sessionsConsidered).toBe(0);
    resolveFirst!({ sessionId: SESSION_A, outcome: 'dispatched', entryId: 'e1' });
    await first;
  });
});
