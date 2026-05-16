import type { AppConfigService } from '../config/app-config.service';
import type { SessionService } from '../sessions/session.service';
import type { NowPlayingResult, NowPlayingService } from './now-playing.service';
import { PlaybackPoller } from './playback-poller';

const SESSION_A = '11111111-1111-1111-1111-111111111111';
const SESSION_B = '22222222-2222-2222-2222-222222222222';

const makeConfig = (enabled = true): jest.Mocked<AppConfigService> =>
  ({ nowPlayingEnabled: enabled, nowPlayingTickMs: 6000 }) as unknown as jest.Mocked<AppConfigService>;

const makeSessions = (ids: string[]): jest.Mocked<SessionService> =>
  ({
    listActiveSessionIds: jest.fn().mockResolvedValue(ids),
  }) as unknown as jest.Mocked<SessionService>;

const makeNowPlaying = (results: NowPlayingResult[]): jest.Mocked<NowPlayingService> => {
  let i = 0;
  return {
    syncSession: jest.fn().mockImplementation(() => Promise.resolve(results[i++])),
  } as unknown as jest.Mocked<NowPlayingService>;
};

describe('PlaybackPoller', () => {
  let poller: PlaybackPoller;
  afterEach(() => poller?.onModuleDestroy());

  it('iterates active sessions and counts transitions', async () => {
    const config = makeConfig();
    const sessions = makeSessions([SESSION_A, SESSION_B]);
    const np = makeNowPlaying([
      { sessionId: SESSION_A, outcome: 'transitioned_playing', trackUri: 'u', entryId: 'e1' },
      { sessionId: SESSION_B, outcome: 'no_change', trackUri: 'v', entryId: 'e2' },
    ]);
    poller = new PlaybackPoller(config, sessions, np);
    const result = await poller.runOnce();
    expect(result.sessionsConsidered).toBe(2);
    expect(result.transitions).toBe(1);
    expect(np.syncSession).toHaveBeenNthCalledWith(1, SESSION_A);
    expect(np.syncSession).toHaveBeenNthCalledWith(2, SESSION_B);
  });

  it('counts completed_previous as a transition', async () => {
    const np = makeNowPlaying([
      {
        sessionId: SESSION_A,
        outcome: 'completed_previous',
        trackUri: 'u',
        entryId: 'e1',
      },
    ]);
    poller = new PlaybackPoller(makeConfig(), makeSessions([SESSION_A]), np);
    const result = await poller.runOnce();
    expect(result.transitions).toBe(1);
  });

  it('swallows per-session failures and keeps going', async () => {
    const np = {
      syncSession: jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({
          sessionId: SESSION_B,
          outcome: 'no_change',
          trackUri: null,
          entryId: null,
        }),
    } as unknown as jest.Mocked<NowPlayingService>;
    poller = new PlaybackPoller(makeConfig(), makeSessions([SESSION_A, SESSION_B]), np);
    const result = await poller.runOnce();
    expect(result.sessionsConsidered).toBe(2);
    expect(result.transitions).toBe(0);
  });

  it('does not start a timer when NOW_PLAYING_ENABLED=false', () => {
    poller = new PlaybackPoller(
      makeConfig(false),
      makeSessions([]),
      makeNowPlaying([]),
    );
    poller.onModuleInit();
    expect(() => poller.onModuleDestroy()).not.toThrow();
  });

  it('skips overlapping ticks', async () => {
    let resolveFirst: (v: NowPlayingResult) => void;
    const np = {
      syncSession: jest
        .fn()
        .mockImplementationOnce(
          () => new Promise<NowPlayingResult>((r) => (resolveFirst = r)),
        )
        .mockResolvedValue({
          sessionId: SESSION_A,
          outcome: 'no_change',
          trackUri: null,
          entryId: null,
        }),
    } as unknown as jest.Mocked<NowPlayingService>;
    poller = new PlaybackPoller(makeConfig(), makeSessions([SESSION_A]), np);
    const first = poller.runOnce();
    const second = await poller.runOnce();
    expect(second.sessionsConsidered).toBe(0);
    resolveFirst!({
      sessionId: SESSION_A,
      outcome: 'no_change',
      trackUri: null,
      entryId: null,
    });
    await first;
  });
});
