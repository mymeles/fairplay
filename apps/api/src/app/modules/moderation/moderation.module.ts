import { Module } from '@nestjs/common';
import { SpotifyAuthModule } from '../spotify-auth/spotify-auth.module';
import { BlacklistService } from './blacklist.service';
import { GuestDisciplineService } from './guest-discipline.service';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { RateLimitService } from './rate-limit.service';

@Module({
  imports: [SpotifyAuthModule],
  controllers: [ModerationController],
  providers: [ModerationService, RateLimitService, BlacklistService, GuestDisciplineService],
  exports: [ModerationService, RateLimitService, BlacklistService, GuestDisciplineService],
})
export class ModerationModule {}
