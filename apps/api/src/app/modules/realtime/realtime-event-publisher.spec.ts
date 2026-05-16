import type { PartyGateway } from './party.gateway';
import { RealtimeEventPublisher } from './realtime-event-publisher';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_SESSION_ID = '99999999-9999-9999-9999-999999999999';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const ENTRY_ID = '33333333-3333-3333-3333-333333333333';

const makeGateway = (): jest.Mocked<PartyGateway> =>
  ({
    emitToSession: jest.fn(),
    emitToGuest: jest.fn(),
  }) as unknown as jest.Mocked<PartyGateway>;

describe('RealtimeEventPublisher', () => {
  it('wraps queue updates and emits them to the party/host rooms', () => {
    const gateway = makeGateway();
    const publisher = new RealtimeEventPublisher(gateway);

    const event = publisher.publishQueueUpdated(SESSION_ID, {
      reason: 'entry_added',
      entryId: ENTRY_ID,
      status: 'PENDING',
    });

    expect(event).toEqual(
      expect.objectContaining({
        type: 'queue.updated',
        sessionId: SESSION_ID,
        sequence: 1,
        payload: expect.objectContaining({ reason: 'entry_added', entryId: ENTRY_ID }),
      }),
    );
    expect(gateway.emitToSession).toHaveBeenCalledWith(event);
  });

  it('increments sequence per session', () => {
    const gateway = makeGateway();
    const publisher = new RealtimeEventPublisher(gateway);

    const first = publisher.publishQueueUpdated(SESSION_ID, { reason: 'entry_added' });
    const second = publisher.publishVoteUpdated(SESSION_ID, {
      entryId: ENTRY_ID,
      guestId: GUEST_ID,
      value: 1,
      upvotes: 1,
      downvotes: 0,
      score: 1,
      status: 'PENDING',
    });
    const other = publisher.publishQueueUpdated(OTHER_SESSION_ID, { reason: 'entry_added' });

    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    expect(other.sequence).toBe(1);
  });

  it('emits token updates to the session and direct guest room', () => {
    const gateway = makeGateway();
    const publisher = new RealtimeEventPublisher(gateway);

    const event = publisher.publishTokenUpdated(SESSION_ID, GUEST_ID, {
      guestId: GUEST_ID,
      tokenType: 'CHALLENGE',
      boostTokens: 3,
      challengeTokens: 0,
      reason: 'challenge_lock',
    });

    expect(event.type).toBe('token.updated');
    expect(gateway.emitToSession).toHaveBeenCalledWith(event);
    expect(gateway.emitToGuest).toHaveBeenCalledWith(GUEST_ID, event);
  });
});
