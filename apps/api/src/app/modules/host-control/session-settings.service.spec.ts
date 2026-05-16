import { DEFAULT_SESSION_SETTINGS } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import type { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import type { SessionRepository } from '../sessions/session.repository';
import type { SessionService } from '../sessions/session.service';
import { SessionSettingsService } from './session-settings.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const HOST_ID = '33333333-3333-3333-3333-333333333333';

const makeSessions = (settings = DEFAULT_SESSION_SETTINGS): jest.Mocked<SessionService> =>
  ({
    getSession: jest.fn().mockResolvedValue({
      id: SESSION_ID,
      hostUserId: HOST_ID,
      settings,
    }),
  }) as unknown as jest.Mocked<SessionService>;

const makeSessionRepo = (): jest.Mocked<SessionRepository> =>
  ({
    updateSettings: jest
      .fn()
      .mockImplementation((id, merged) => Promise.resolve({ id, settings: merged })),
  }) as unknown as jest.Mocked<SessionRepository>;

const makeRealtime = (): jest.Mocked<RealtimeEventPublisher> =>
  ({ publishSessionUpdated: jest.fn() }) as unknown as jest.Mocked<RealtimeEventPublisher>;

const makeService = (settings = DEFAULT_SESSION_SETTINGS) => {
  const sessions = makeSessions(settings);
  const sessionRepo = makeSessionRepo();
  const realtime = makeRealtime();
  const service = new SessionSettingsService(sessions, sessionRepo, realtime);
  return { service, sessions, sessionRepo, realtime };
};

describe('SessionSettingsService.updateSettings', () => {
  it('merges a top-level patch onto the existing settings', async () => {
    const { service, sessionRepo } = makeService();
    const result = await service.updateSettings(SESSION_ID, HOST_ID, {
      lockSize: 5,
      allowExplicitTracks: false,
    });
    expect(result.settings.lockSize).toBe(5);
    expect(result.settings.allowExplicitTracks).toBe(false);
    expect(result.settings.lockDurationSeconds).toBe(
      DEFAULT_SESSION_SETTINGS.lockDurationSeconds,
    );
    expect(sessionRepo.updateSettings).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ lockSize: 5, allowExplicitTracks: false }),
    );
  });

  it('deep-merges a scoring patch and keeps unspecified weights intact', async () => {
    const { service } = makeService();
    const result = await service.updateSettings(SESSION_ID, HOST_ID, {
      scoring: { upvoteWeight: 99 },
    });
    expect(result.settings.scoring.upvoteWeight).toBe(99);
    expect(result.settings.scoring.downvoteWeight).toBe(
      DEFAULT_SESSION_SETTINGS.scoring.downvoteWeight,
    );
  });

  it('publishes session.updated with the merged settings', async () => {
    const { service, realtime } = makeService();
    await service.updateSettings(SESSION_ID, HOST_ID, { lockSize: 4 });
    expect(realtime.publishSessionUpdated).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        sessionId: SESSION_ID,
        settings: expect.objectContaining({ lockSize: 4 }),
      }),
    );
  });

  it('forwards ownership errors as FORBIDDEN', async () => {
    const { service, sessions, sessionRepo } = makeService();
    (sessions.getSession as jest.Mock).mockRejectedValue(
      new DomainError('FORBIDDEN', 'nope'),
    );
    await expect(
      service.updateSettings(SESSION_ID, HOST_ID, { lockSize: 4 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(sessionRepo.updateSettings).not.toHaveBeenCalled();
  });

  it('skips undefined keys so an empty patch does not blow away values', async () => {
    const { service, sessionRepo } = makeService({
      ...DEFAULT_SESSION_SETTINGS,
      lockSize: 7,
    });
    await service.updateSettings(SESSION_ID, HOST_ID, {
      lockSize: undefined,
      allowExplicitTracks: false,
    });
    const persisted = (sessionRepo.updateSettings as jest.Mock).mock.calls[0][1];
    expect(persisted.lockSize).toBe(7);
    expect(persisted.allowExplicitTracks).toBe(false);
  });
});
