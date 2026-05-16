import { WsException } from '@nestjs/websockets';
import { AppConfigService } from '../config/app-config.service';
import { GuestJwtService } from '../guests/guest-jwt.service';
import { HostJwtService } from '../spotify-auth/host-jwt.service';
import type { SessionService } from '../sessions/session.service';
import { PartyGateway, type PartySocket } from './party.gateway';
import { guestRoom, hostRoom, partyRoom } from './realtime-rooms';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_SESSION_ID = '99999999-9999-9999-9999-999999999999';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';
const HOST_ID = '33333333-3333-3333-3333-333333333333';
const cfg = { hostJwtSecret: 's'.repeat(64) } as AppConfigService;

const makeSocket = (token?: string): jest.Mocked<PartySocket> =>
  ({
    id: `socket-${Math.random()}`,
    handshake: {
      auth: token ? { token } : {},
      headers: {},
    },
    data: {},
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  }) as unknown as jest.Mocked<PartySocket>;

const makeGateway = () => {
  const guestJwt = new GuestJwtService(cfg);
  const hostJwt = new HostJwtService(cfg);
  const sessions = {
    getSession: jest.fn().mockResolvedValue({ id: SESSION_ID, hostUserId: HOST_ID }),
  } as unknown as jest.Mocked<SessionService>;
  const gateway = new PartyGateway(guestJwt, hostJwt, sessions);
  gateway.server = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  } as never;
  return { gateway, guestJwt, hostJwt, sessions };
};

describe('PartyGateway.handleConnection', () => {
  it('joins a guest to their party and guest rooms', async () => {
    const { gateway, guestJwt } = makeGateway();
    const socket = makeSocket(guestJwt.sign(GUEST_ID, SESSION_ID));

    await gateway.handleConnection(socket);

    expect(socket.join).toHaveBeenCalledWith(partyRoom(SESSION_ID));
    expect(socket.join).toHaveBeenCalledWith(guestRoom(GUEST_ID));
    expect(socket.emit).toHaveBeenCalledWith(
      'realtime.ready',
      expect.objectContaining({ role: 'guest', sessionId: SESSION_ID }),
    );
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('allows a guest to reconnect and rejoin the same rooms', async () => {
    const { gateway, guestJwt } = makeGateway();
    const token = guestJwt.sign(GUEST_ID, SESSION_ID);
    const first = makeSocket(token);
    const second = makeSocket(token);

    await gateway.handleConnection(first);
    await gateway.handleConnection(second);

    expect(first.join).toHaveBeenCalledWith(partyRoom(SESSION_ID));
    expect(second.join).toHaveBeenCalledWith(partyRoom(SESSION_ID));
    expect(second.join).toHaveBeenCalledWith(guestRoom(GUEST_ID));
  });

  it('disconnects clients without a token', async () => {
    const { gateway } = makeGateway();
    const socket = makeSocket();

    await gateway.handleConnection(socket);

    expect(socket.emit).toHaveBeenCalledWith(
      'realtime.error',
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('connects a host without joining a session room until requested', async () => {
    const { gateway, hostJwt } = makeGateway();
    const socket = makeSocket(hostJwt.sign(HOST_ID));

    await gateway.handleConnection(socket);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      'realtime.ready',
      expect.objectContaining({ role: 'host', rooms: [] }),
    );
  });
});

describe('PartyGateway.joinHostSession', () => {
  it('lets the owning host join the host room for a session', async () => {
    const { gateway, hostJwt, sessions } = makeGateway();
    const socket = makeSocket(hostJwt.sign(HOST_ID));
    await gateway.handleConnection(socket);

    await expect(gateway.joinHostSession(socket, { sessionId: SESSION_ID })).resolves.toEqual({
      ok: true,
      room: hostRoom(SESSION_ID),
    });

    expect(sessions.getSession).toHaveBeenCalledWith(SESSION_ID, HOST_ID);
    expect(socket.join).toHaveBeenCalledWith(hostRoom(SESSION_ID));
  });

  it('rejects guests trying to join a host room', async () => {
    const { gateway, guestJwt } = makeGateway();
    const socket = makeSocket(guestJwt.sign(GUEST_ID, SESSION_ID));
    await gateway.handleConnection(socket);

    await expect(gateway.joinHostSession(socket, { sessionId: SESSION_ID })).rejects.toBeInstanceOf(
      WsException,
    );
  });

  it('rejects malformed session IDs', async () => {
    const { gateway, hostJwt } = makeGateway();
    const socket = makeSocket(hostJwt.sign(HOST_ID));
    await gateway.handleConnection(socket);

    await expect(
      gateway.joinHostSession(socket, { sessionId: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(WsException);
  });

  it('surfaces host ownership rejection', async () => {
    const { gateway, hostJwt, sessions } = makeGateway();
    const socket = makeSocket(hostJwt.sign(HOST_ID));
    await gateway.handleConnection(socket);
    (sessions.getSession as jest.Mock).mockRejectedValueOnce(new Error('forbidden'));

    await expect(gateway.joinHostSession(socket, { sessionId: OTHER_SESSION_ID })).rejects.toThrow(
      'forbidden',
    );
  });
});

describe('PartyGateway.emitToSession', () => {
  it('broadcasts to party and host rooms', () => {
    const { gateway } = makeGateway();
    const server = gateway.server as unknown as { to: jest.Mock; emit: jest.Mock };
    const event = {
      type: 'queue.updated' as const,
      sessionId: SESSION_ID,
      sequence: 1,
      emittedAt: new Date().toISOString(),
      payload: { reason: 'entry_added' as const },
    };

    gateway.emitToSession(event);

    expect(server.to).toHaveBeenCalledWith(partyRoom(SESSION_ID));
    expect(server.to).toHaveBeenCalledWith(hostRoom(SESSION_ID));
    expect(server.emit).toHaveBeenCalledWith('queue.updated', event);
  });
});
