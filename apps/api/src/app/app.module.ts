import { Module } from '@nestjs/common';
import { AppConfigModule } from './modules/config/app-config.module';
import { DatabaseModule } from './modules/database/database.module';
import { RedisModule } from './modules/redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { CryptoModule } from './modules/crypto/crypto.module';
import { SpotifyAuthModule } from './modules/spotify-auth/spotify-auth.module';
import { SpotifyPlaybackModule } from './modules/spotify-playback/spotify-playback.module';
import { SessionModule } from './modules/sessions/session.module';
import { GuestModule } from './modules/guests/guest.module';
import { ProximityModule } from './modules/proximity/proximity.module';
import { TrackModule } from './modules/tracks/track.module';
import { QueueModule } from './modules/queue/queue.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { ScoreRebuildModule } from './modules/scoring/score-rebuild.module';
import { VoteModule } from './modules/voting/vote.module';
import { LockWindowModule } from './modules/lock-window/lock-window.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RunnerModule } from './modules/runner/runner.module';
import { NowPlayingModule } from './modules/now-playing/now-playing.module';
import { HostControlModule } from './modules/host-control/host-control.module';
import { TokenModule } from './modules/tokens/token.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { FallbackPlaylistModule } from './modules/fallback-playlist/fallback-playlist.module';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { MiddlewareConsumer, NestModule } from '@nestjs/common';

@Module({
  imports: [
    ObservabilityModule,
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    CryptoModule,
    HealthModule,
    SpotifyAuthModule,
    SpotifyPlaybackModule,
    ProximityModule,
    SessionModule,
    GuestModule,
    TrackModule,
    ScoringModule,
    RealtimeModule,
    QueueModule,
    VoteModule,
    ScoreRebuildModule,
    LockWindowModule,
    RunnerModule,
    NowPlayingModule,
    HostControlModule,
    TokenModule,
    ModerationModule,
    FallbackPlaylistModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
