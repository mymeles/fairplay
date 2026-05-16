import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SessionModule } from '../sessions/session.module';
import { SpotifyPlaybackModule } from '../spotify-playback/spotify-playback.module';
import { NowPlayingService } from './now-playing.service';
import { PlaybackPoller } from './playback-poller';

// M13 — Now-Playing Sync. Polls the host's Spotify player on a timer and
// drives QUEUED_TO_SPOTIFY → PLAYING → PLAYED transitions. Publishes
// now_playing.updated for UI listeners. Reads the same queue tables M07/M12
// wrote, so we just import QueueModule for the repositories.
@Module({
  imports: [SessionModule, QueueModule, SpotifyPlaybackModule, RealtimeModule],
  providers: [NowPlayingService, PlaybackPoller],
  exports: [NowPlayingService, PlaybackPoller],
})
export class NowPlayingModule {}
