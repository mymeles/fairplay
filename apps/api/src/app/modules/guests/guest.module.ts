import { Module, forwardRef } from '@nestjs/common';
import { ProximityModule } from '../proximity/proximity.module';
import { SessionModule } from '../sessions/session.module';
import { GuestAuthGuard } from './guest-auth.guard';
import { GuestJwtService } from './guest-jwt.service';
import { GuestRepository } from './guest.repository';
import { GuestService } from './guest.service';
import { GuestWalletRepository } from './guest-wallet.repository';

@Module({
  imports: [forwardRef(() => SessionModule), ProximityModule],
  providers: [
    GuestService,
    GuestAuthGuard,
    GuestJwtService,
    GuestRepository,
    GuestWalletRepository,
  ],
  exports: [
    GuestService,
    GuestAuthGuard,
    GuestJwtService,
    GuestRepository,
    GuestWalletRepository,
  ],
})
export class GuestModule {}
