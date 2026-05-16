import { Module } from '@nestjs/common';
import { GuestModule } from '../guests/guest.module';
import { ModerationModule } from '../moderation/moderation.module';
import { QueueModule } from '../queue/queue.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ScoreRebuildModule } from '../scoring/score-rebuild.module';
import { SessionModule } from '../sessions/session.module';
import { SpotifyAuthModule } from '../spotify-auth/spotify-auth.module';
import { TokenModule } from '../tokens/token.module';
import { ChallengeService } from './challenge.service';
import { LockWindowController } from './lock-window.controller';
import { LockWindowScheduler } from './lock-window.scheduler';
import { LockWindowService } from './lock-window.service';

@Module({
  imports: [
    GuestModule,
    SessionModule,
    QueueModule,
    ScoreRebuildModule,
    SpotifyAuthModule,
    RealtimeModule,
    TokenModule,
    ModerationModule,
  ],
  controllers: [LockWindowController],
  providers: [LockWindowService, ChallengeService, LockWindowScheduler],
  exports: [LockWindowService, ChallengeService],
})
export class LockWindowModule {}
