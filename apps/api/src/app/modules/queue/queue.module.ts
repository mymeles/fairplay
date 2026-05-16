import { Module } from '@nestjs/common';
import { GuestModule } from '../guests/guest.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ScoringModule } from '../scoring/scoring.module';
import { SessionModule } from '../sessions/session.module';
import { TrackModule } from '../tracks/track.module';
import { QueueController } from './queue.controller';
import { QueueEntryRepository } from './queue-entry.repository';
import { QueueService } from './queue.service';
import { RedisQueueRepository } from './redis-queue.repository';

@Module({
  imports: [GuestModule, SessionModule, TrackModule, ScoringModule, RealtimeModule],
  controllers: [QueueController],
  providers: [QueueService, QueueEntryRepository, RedisQueueRepository],
  exports: [QueueService, QueueEntryRepository, RedisQueueRepository],
})
export class QueueModule {}
