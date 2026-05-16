import { Module } from '@nestjs/common';
import { GuestModule } from '../guests/guest.module';
import { QueueModule } from '../queue/queue.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ScoringModule } from '../scoring/scoring.module';
import { SessionModule } from '../sessions/session.module';
import { SpotifyAuthModule } from '../spotify-auth/spotify-auth.module';
import { BoostService } from './boost.service';
import {
  GuestWalletController,
  HostTokenGrantController,
  QueueBoostController,
} from './token.controller';
import { GuestWalletService } from './guest-wallet.service';
import { TokenLedgerService } from './token-ledger.service';

@Module({
  imports: [
    GuestModule,
    SessionModule,
    QueueModule,
    ScoringModule,
    RealtimeModule,
    SpotifyAuthModule,
  ],
  controllers: [GuestWalletController, QueueBoostController, HostTokenGrantController],
  providers: [GuestWalletService, TokenLedgerService, BoostService],
  exports: [GuestWalletService, TokenLedgerService, BoostService],
})
export class TokenModule {}
