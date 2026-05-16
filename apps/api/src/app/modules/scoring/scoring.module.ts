import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service';

// Holds only the pure calculator. Importable from any module without
// creating cycles — QueueService and VoteService both depend on this.
// The rebuild service + dev controller live in ScoreRebuildModule.
@Module({
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
