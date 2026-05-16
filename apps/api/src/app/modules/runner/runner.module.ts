import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SessionModule } from '../sessions/session.module';
import { SpotifyPlaybackModule } from '../spotify-playback/spotify-playback.module';
import { QueueDispatchService } from './queue-dispatch.service';
import { RunnerStateService } from './runner-state.service';
import { RunnerWorker } from './runner.worker';
import { SpotifyCircuitBreaker } from './spotify-circuit-breaker';
import { SpotifyQueueAdapter } from './spotify-queue.adapter';

// M12 — Spotify Queue Runner.
//
// The runner reads the internal queue (Postgres + Redis ZSET projections),
// picks the highest-ranked PENDING entry per active session, and appends it
// to the host's Spotify queue. State and circuit-breaker info live in-memory
// per API process; horizontal scale-out is a separate concern (see the
// `apps/runner` placeholder + the handoff doc's "next steps" notes).
@Module({
  imports: [SessionModule, QueueModule, SpotifyPlaybackModule, RealtimeModule],
  providers: [
    SpotifyQueueAdapter,
    SpotifyCircuitBreaker,
    RunnerStateService,
    QueueDispatchService,
    RunnerWorker,
  ],
  exports: [QueueDispatchService, RunnerStateService, RunnerWorker, SpotifyCircuitBreaker],
})
export class RunnerModule {}
