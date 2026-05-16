import type { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import { RunnerStateService } from './runner-state.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';

const makePublisher = (): jest.Mocked<RealtimeEventPublisher> =>
  ({
    publishRunnerStatusChanged: jest.fn(),
  }) as unknown as jest.Mocked<RealtimeEventPublisher>;

describe('RunnerStateService', () => {
  it('defaults to IDLE/enabled for an unknown session', () => {
    const svc = new RunnerStateService();
    expect(svc.isEnabled(SESSION_ID)).toBe(true);
    expect(svc.snapshot(SESSION_ID).status).toBe('IDLE');
  });

  it('publishes on transition and skips publish when nothing changed', () => {
    const realtime = makePublisher();
    const svc = new RunnerStateService(realtime);
    svc.markActive(SESSION_ID, 'entry-1');
    svc.markActive(SESSION_ID, 'entry-1'); // identical → no second publish
    expect(realtime.publishRunnerStatusChanged).toHaveBeenCalledTimes(1);
    const [[, payload]] = realtime.publishRunnerStatusChanged.mock.calls as unknown as [[
      string,
      { state: string; reason: string; lastEntryId: string },
    ]];
    expect(payload.state).toBe('ACTIVE');
    expect(payload.lastEntryId).toBe('entry-1');
  });

  it('markIdle is a no-op when already idle (no duplicate publishes)', () => {
    const realtime = makePublisher();
    const svc = new RunnerStateService(realtime);
    svc.markIdle(SESSION_ID); // no prior state — no publish
    svc.markActive(SESSION_ID, 'e1');
    svc.markIdle(SESSION_ID);
    svc.markIdle(SESSION_ID);
    const calls = realtime.publishRunnerStatusChanged.mock.calls.map(
      (c) => (c[1] as { state: string }).state,
    );
    expect(calls).toEqual(['ACTIVE', 'IDLE']);
  });

  it('disable + enable round-trip', () => {
    const realtime = makePublisher();
    const svc = new RunnerStateService(realtime);
    svc.disable(SESSION_ID, 'premium_required', 'SPOTIFY_PREMIUM_REQUIRED');
    expect(svc.isEnabled(SESSION_ID)).toBe(false);
    svc.enable(SESSION_ID);
    expect(svc.isEnabled(SESSION_ID)).toBe(true);
    const states = realtime.publishRunnerStatusChanged.mock.calls.map(
      (c) => (c[1] as { state: string }).state,
    );
    expect(states).toEqual(['DISABLED', 'IDLE']);
  });

  it('isBackingOff respects retryAtMs', () => {
    const svc = new RunnerStateService();
    const now = new Date();
    svc.markBackingOff(SESSION_ID, 'rate_limited', now.getTime() + 5_000);
    expect(svc.isBackingOff(SESSION_ID, now)).toBe(true);
    expect(svc.isBackingOff(SESSION_ID, new Date(now.getTime() + 6_000))).toBe(false);
  });

  it('forgetSession emits a final DISABLED transition and drops state', () => {
    const realtime = makePublisher();
    const svc = new RunnerStateService(realtime);
    svc.markActive(SESSION_ID, 'e1');
    svc.forgetSession(SESSION_ID);
    const last = realtime.publishRunnerStatusChanged.mock.calls.pop()?.[1] as {
      state: string;
      reason: string;
    };
    expect(last.state).toBe('DISABLED');
    expect(last.reason).toBe('session_ended');
    expect(svc.snapshot(SESSION_ID).status).toBe('IDLE'); // back to default
  });
});
