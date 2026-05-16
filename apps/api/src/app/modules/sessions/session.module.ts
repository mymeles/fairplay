import { Module, forwardRef } from '@nestjs/common';
import { GuestModule } from '../guests/guest.module';
import { SpotifyAuthModule } from '../spotify-auth/spotify-auth.module';
import { JoinCodeService } from './join-code.service';
import { QrTokenService } from './qr-token.service';
import { SessionController } from './session.controller';
import { SessionRepository } from './session.repository';
import { SessionService } from './session.service';

@Module({
  // forwardRef because SessionService and GuestService refer to each other
  // (sessions own the controller; guests need session lookup for join).
  imports: [SpotifyAuthModule, forwardRef(() => GuestModule)],
  controllers: [SessionController],
  providers: [SessionService, SessionRepository, JoinCodeService, QrTokenService],
  exports: [SessionService, SessionRepository, JoinCodeService, QrTokenService],
})
export class SessionModule {}
