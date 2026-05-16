import { Module } from '@nestjs/common';
import { GuestModule } from '../guests/guest.module';
import { ModerationModule } from '../moderation/moderation.module';
import { QueueModule } from '../queue/queue.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ScoringModule } from '../scoring/scoring.module';
import { SessionModule } from '../sessions/session.module';
import { VoteController } from './vote.controller';
import { VoteRateLimiter } from './vote-rate-limiter';
import { VoteRepository } from './vote.repository';
import { VoteService } from './vote.service';

@Module({
  imports: [GuestModule, SessionModule, QueueModule, ScoringModule, RealtimeModule, ModerationModule],
  controllers: [VoteController],
  providers: [VoteService, VoteRepository, VoteRateLimiter],
  exports: [VoteService, VoteRepository],
})
export class VoteModule {}
