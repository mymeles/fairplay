import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation/moderation.module';
import { SessionModule } from '../sessions/session.module';
import { SpotifyAuthModule } from '../spotify-auth/spotify-auth.module';
import { TrackModule } from '../tracks/track.module';
import { FallbackPlaylistController } from './fallback-playlist.controller';
import { FallbackPlaylistRepository } from './fallback-playlist.repository';
import { FallbackPlaylistService } from './fallback-playlist.service';

@Module({
  imports: [SessionModule, TrackModule, ModerationModule, SpotifyAuthModule],
  controllers: [FallbackPlaylistController],
  providers: [FallbackPlaylistRepository, FallbackPlaylistService],
  exports: [FallbackPlaylistRepository, FallbackPlaylistService],
})
export class FallbackPlaylistModule {}
