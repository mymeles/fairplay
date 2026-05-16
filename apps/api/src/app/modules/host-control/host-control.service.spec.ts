import { DEFAULT_SESSION_SETTINGS } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import type {
  QueueEntryRecord,
  QueueEntryRepository,
} from '../queue/queue-entry.repository';
import type { RealtimeEventPublisher } from '../realtime/realtime-event-publisher';
import type { RunnerStateService } from '../runner/runner-state.service';
import type { ScoreRebuildService } from '../scoring/score-rebuild.service';
import type { SessionService } from '../sessions/session.service';
import { HostControlService } from './host-control.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const HOST_ID = '33333333-3333-3333-3333-333333333333';
const ENTRY_ID = '44444444-4444-4444-4444-444444444444';

const entryRow = (overrides: Partial<QueueEntryRecord> = {}): QueueEntryRecord => ({
  id: ENTRY_ID,
  sessionId: SESSION_ID,
  trackId: 't',
  addedByGuestId: 'g',
  status: 'PENDING',
  upvotes: 0,
  downvotes: 0,
  boostCredits: 0,
  score: 1,
  lockedUntil: null,
  hostPinned: false,
  spotifyQueuedAt: null,
  playingAt: null,
  playedAt: null,
  removedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeSessions = (): jest.Mocked<SessionService> =>
  ({
    getSession: jest.fn().mockResolvedValue({
      id: SESSION_ID,
      hostUserId: HOST_ID,
      settings: DEFAULT_SESSION_SETTINGS,
    }),
  }) as unknown as jest.Mocked<SessionService>;

const makeEntries = (
  found: QueueEntryRecord | null = entryRow(),
): jest.Mocked<QueueEntryRepository> =>
  ({
    findById: jest.fn().mockResolvedValue(found),
    setHostPinned: jest
      .fn()
      .mockImplementation((id, pinned) =>
        Promise.resolve(entryRow({ id, hostPinned: pinned })),
      ),
  }) as unknown as jest.Mocked<QueueEntryRepository>;

const makeRebuild = (): jest.Mocked<ScoreRebuildService> =>
  ({
    recalculateEntry: jest
      .fn()
      .mockImplementation((id) =>
        Promise.resolve(entryRow({ id, hostPinned: true, score: 1000 })),
      ),
  }) as unknown as jest.Mocked<ScoreRebuildService>;

const makeRunner = (): jest.Mocked<RunnerStateService> =>
  ({
    enable: jest.fn(),
    disable: jest.fn(),
    snapshot: jest.fn().mockReturnValue({
      sessionId: SESSION_ID,
      enabled: true,
      status: 'IDLE',
      reason: 'started',
      retryAtMs: null,
      updatedAtMs: 0,
    }),
  }) as unknown as jest.Mocked<RunnerStateService>;

const makeRealtime = (): jest.Mocked<RealtimeEventPublisher> =>
  ({ publishQueueUpdated: jest.fn() }) as unknown as jest.Mocked<RealtimeEventPublisher>;

const makeService = (overrides: { entry?: QueueEntryRecord | null } = {}) => {
  const sessions = makeSessions();
  const entries = makeEntries(overrides.entry === undefined ? entryRow() : overrides.entry);
  const rebuild = makeRebuild();
  const runner = makeRunner();
  const realtime = makeRealtime();
  const service = new HostControlService(sessions, entries, rebuild, runner, realtime);
  return { service, sessions, entries, rebuild, runner, realtime };
};

describe('HostControlService.pinEntry', () => {
  it('sets hostPinned=true and triggers a score recalc', async () => {
    const { service, entries, rebuild, realtime } = makeService();
    const result = await service.pinEntry(ENTRY_ID, HOST_ID);
    expect(entries.setHostPinned).toHaveBeenCalledWith(ENTRY_ID, true);
    expect(rebuild.recalculateEntry).toHaveBeenCalledWith(ENTRY_ID);
    expect(result.hostPinned).toBe(true);
    expect(realtime.publishQueueUpdated).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ reason: 'host_pinned', entryId: ENTRY_ID }),
    );
  });

  it('is idempotent when already pinned (no setHostPinned, no publish)', async () => {
    const { service, entries, realtime } = makeService({
      entry: entryRow({ hostPinned: true }),
    });
    const result = await service.pinEntry(ENTRY_ID, HOST_ID);
    expect(entries.setHostPinned).not.toHaveBeenCalled();
    expect(realtime.publishQueueUpdated).not.toHaveBeenCalled();
    expect(result.hostPinned).toBe(true);
  });

  it('404s on an unknown entry', async () => {
    const { service } = makeService({ entry: null });
    await expect(service.pinEntry(ENTRY_ID, HOST_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('forwards session ownership errors as FORBIDDEN', async () => {
    const { service, sessions } = makeService();
    (sessions.getSession as jest.Mock).mockRejectedValueOnce(
      new DomainError('FORBIDDEN', 'not your session'),
    );
    await expect(service.pinEntry(ENTRY_ID, HOST_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('refuses to pin a PLAYED entry', async () => {
    const { service } = makeService({ entry: entryRow({ status: 'PLAYED' }) });
    await expect(service.pinEntry(ENTRY_ID, HOST_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { status: 'PLAYED' },
    });
  });
});

describe('HostControlService.unpinEntry', () => {
  it('clears hostPinned and recalculates score', async () => {
    const { service, entries, rebuild, realtime } = makeService({
      entry: entryRow({ hostPinned: true }),
    });
    await service.unpinEntry(ENTRY_ID, HOST_ID);
    expect(entries.setHostPinned).toHaveBeenCalledWith(ENTRY_ID, false);
    expect(rebuild.recalculateEntry).toHaveBeenCalledWith(ENTRY_ID);
    expect(realtime.publishQueueUpdated).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ reason: 'host_unpinned' }),
    );
  });
});

describe('HostControlService runner start/stop', () => {
  it('startRunner verifies ownership then enables', async () => {
    const { service, sessions, runner } = makeService();
    const result = await service.startRunner(SESSION_ID, HOST_ID);
    expect(sessions.getSession).toHaveBeenCalledWith(SESSION_ID, HOST_ID);
    expect(runner.enable).toHaveBeenCalledWith(SESSION_ID);
    expect(result.enabled).toBe(true);
  });

  it('stopRunner verifies ownership then disables with host_disabled', async () => {
    const { service, runner } = makeService();
    const result = await service.stopRunner(SESSION_ID, HOST_ID);
    expect(runner.disable).toHaveBeenCalledWith(SESSION_ID, 'host_disabled');
    expect(result.enabled).toBe(false);
  });

  it('refuses to toggle the runner when ownership fails', async () => {
    const { service, sessions } = makeService();
    (sessions.getSession as jest.Mock).mockRejectedValue(
      new DomainError('FORBIDDEN', 'nope'),
    );
    await expect(service.startRunner(SESSION_ID, HOST_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(service.stopRunner(SESSION_ID, HOST_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
