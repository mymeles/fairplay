import { Module } from '@nestjs/common';
import { GuestModule } from '../guests/guest.module';
import { SessionModule } from '../sessions/session.module';
import { SpotifyAuthModule } from '../spotify-auth/spotify-auth.module';
import { PartyGateway } from './party.gateway';
import { RealtimeEventPublisher } from './realtime-event-publisher';

@Module({
  imports: [GuestModule, SpotifyAuthModule, SessionModule],
  providers: [PartyGateway, RealtimeEventPublisher],
  exports: [RealtimeEventPublisher],
})
export class RealtimeModule {}
