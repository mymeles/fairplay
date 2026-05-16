import { Module } from '@nestjs/common';
import { GuestModule } from '../guests/guest.module';
import { SessionModule } from '../sessions/session.module';
import { SpotifyPlaybackModule } from '../spotify-playback/spotify-playback.module';
import { SpotifySearchAdapter } from './spotify-search.adapter';
import { TrackController } from './track.controller';
import { TrackNormalizer } from './track-normalizer';
import { TrackRepository } from './track.repository';
import { TrackSearchService } from './track-search.service';

@Module({
  imports: [GuestModule, SessionModule, SpotifyPlaybackModule],
  controllers: [TrackController],
  providers: [SpotifySearchAdapter, TrackNormalizer, TrackRepository, TrackSearchService],
  exports: [TrackNormalizer, TrackRepository, TrackSearchService],
})
export class TrackModule {}

