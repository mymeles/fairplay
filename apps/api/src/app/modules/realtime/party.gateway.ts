import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { RealtimeEventEnvelope } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import type { Server, Socket } from 'socket.io';
import { getAllowedCorsOrigins } from '../../common/cors-origins';
import { GuestJwtService } from '../guests/guest-jwt.service';
import { HostJwtService } from '../spotify-auth/host-jwt.service';
import { SessionService } from '../sessions/session.service';
import { guestRoom, hostRoom, partyRoom } from './realtime-rooms';

type ClientAuth =
  | { role: 'guest'; guestId: string; sessionId: string }
  | { role: 'host'; hostUserId: string };

export type PartySocket = Socket & { data: { auth?: ClientAuth } };

interface HostJoinBody {
  sessionId?: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@WebSocketGateway({
  namespace: '/party',
  cors: {
    origin: getAllowedCorsOrigins(),
    credentials: false,
  },
})
export class PartyGateway implements OnGatewayConnection {
  private readonly logger = new Logger(PartyGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly guestJwt: GuestJwtService,
    private readonly hostJwt: HostJwtService,
    private readonly sessions: SessionService,
  ) {}

  async handleConnection(client: PartySocket): Promise<void> {
    try {
      const token = this.extractBearerToken(client);
      const auth = this.authenticate(token);
      client.data.auth = auth;

      if (auth.role === 'guest') {
        await client.join(partyRoom(auth.sessionId));
        await client.join(guestRoom(auth.guestId));
        client.emit('realtime.ready', {
          role: 'guest',
          sessionId: auth.sessionId,
          rooms: [partyRoom(auth.sessionId), guestRoom(auth.guestId)],
        });
        this.logger.log(
          { socketId: client.id, sessionId: auth.sessionId, guestId: auth.guestId },
          'Realtime guest connected.',
        );
        return;
      }

      client.emit('realtime.ready', { role: 'host', rooms: [] });
      this.logger.log(
        { socketId: client.id, hostUserId: auth.hostUserId },
        'Realtime host connected.',
      );
    } catch (err) {
      client.emit('realtime.error', {
        code: err instanceof DomainError ? err.code : 'UNAUTHORIZED',
        message: err instanceof Error ? err.message : 'Realtime authentication failed.',
      });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('host.join_session')
  async joinHostSession(
    @ConnectedSocket() client: PartySocket,
    @MessageBody() body: HostJoinBody,
  ): Promise<{ ok: true; room: string }> {
    const auth = client.data.auth;
    if (!auth || auth.role !== 'host') {
      throw new WsException('Only hosts can join host session rooms.');
    }
    const sessionId = this.parseSessionId(body.sessionId);
    await this.sessions.getSession(sessionId, auth.hostUserId);
    const room = hostRoom(sessionId);
    await client.join(room);
    this.logger.log(
      { socketId: client.id, hostUserId: auth.hostUserId, sessionId },
      'Realtime host joined session room.',
    );
    return { ok: true, room };
  }

  emitToSession<TPayload>(event: RealtimeEventEnvelope<TPayload>): void {
    this.server
      .to(partyRoom(event.sessionId))
      .to(hostRoom(event.sessionId))
      .emit(event.type, event);
  }

  emitToGuest<TPayload>(guestId: string, event: RealtimeEventEnvelope<TPayload>): void {
    this.server.to(guestRoom(guestId)).emit(event.type, event);
  }

  private authenticate(token: string): ClientAuth {
    try {
      const guest = this.guestJwt.verify(token);
      return { role: 'guest', guestId: guest.sub, sessionId: guest.sid };
    } catch {
      const host = this.hostJwt.verify(token);
      return { role: 'host', hostUserId: host.sub };
    }
  }

  private extractBearerToken(client: PartySocket): string {
    const rawAuthToken = client.handshake.auth?.token;
    if (typeof rawAuthToken === 'string' && rawAuthToken.trim()) {
      return stripBearer(rawAuthToken);
    }
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.trim()) {
      return stripBearer(header);
    }
    throw new DomainError('UNAUTHORIZED', 'Missing realtime bearer token.');
  }

  private parseSessionId(value: unknown): string {
    if (typeof value !== 'string' || !UUID_RE.test(value)) {
      throw new WsException('sessionId must be a UUID.');
    }
    return value;
  }
}

const stripBearer = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.startsWith('Bearer ') ? trimmed.slice('Bearer '.length).trim() : trimmed;
};
