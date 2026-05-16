import { Module } from '@nestjs/common';
import { JoinTrustScorer } from './join-trust-scorer';
import { ProximityService } from './proximity.service';

@Module({
  providers: [JoinTrustScorer, ProximityService],
  exports: [JoinTrustScorer, ProximityService],
})
export class ProximityModule {}
