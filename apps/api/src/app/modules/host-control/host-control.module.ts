import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RunnerModule } from '../runner/runner.module';
import { ScoreRebuildModule } from '../scoring/score-rebuild.module';
import { SessionModule } from '../sessions/session.module';
import { SpotifyAuthModule } from '../spotify-auth/spotify-auth.module';
import { HostControlService } from './host-control.service';
import { HostQueueController } from './host-queue.controller';
import { HostRunnerController } from './host-runner.controller';
import { SessionSettingsService } from './session-settings.service';

// M14 — Host Controls. Sits on top of:
//   - QueueModule (entry repo for pin/unpin)
//   - ScoreRebuildModule (recompute score after pin flip)
//   - RunnerModule (state service for runner start/stop)
//   - SessionModule (ownership check via getSession)
//   - SpotifyAuthModule (HostAuthGuard)
// The Spotify skip/pause/resume endpoints stay in HostDeviceController since
// they're playback control rather than queue/session control.
@Module({
  imports: [
    SessionModule,
    QueueModule,
    ScoreRebuildModule,
    RunnerModule,
    RealtimeModule,
    SpotifyAuthModule,
  ],
  controllers: [HostQueueController, HostRunnerController],
  providers: [HostControlService, SessionSettingsService],
  exports: [HostControlService, SessionSettingsService],
})
export class HostControlModule {}
