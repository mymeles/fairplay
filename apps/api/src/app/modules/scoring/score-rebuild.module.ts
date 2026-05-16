import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { SessionModule } from '../sessions/session.module';
import { ScoreRebuildService } from './score-rebuild.service';
import { ScoringDevController } from './scoring-dev.controller';
import { ScoringModule } from './scoring.module';

// Pulls Postgres + Redis together; importable wherever a rebuild is needed
// (M14 host controls, M12 runner if it ever needs to re-evaluate, etc.).
// Kept separate from ScoringModule to avoid cycles with QueueModule.
@Module({
  imports: [SessionModule, QueueModule, ScoringModule],
  controllers: [ScoringDevController],
  providers: [ScoreRebuildService],
  exports: [ScoreRebuildService],
})
export class ScoreRebuildModule {}
