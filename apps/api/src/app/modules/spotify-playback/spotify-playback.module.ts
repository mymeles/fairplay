import { Module } from '@nestjs/common';
import { SpotifyAuthModule } from '../spotify-auth/spotify-auth.module';
import { HostDeviceController } from './host-device.controller';
import { SpotifyDeviceService } from './spotify-device.service';
import { SpotifyPlaybackAdapter } from './spotify-playback.adapter';
import { SpotifyTokenRefreshService } from './spotify-token-refresh.service';

@Module({
  imports: [SpotifyAuthModule],
  controllers: [HostDeviceController],
  providers: [SpotifyPlaybackAdapter, SpotifyTokenRefreshService, SpotifyDeviceService],
  exports: [SpotifyPlaybackAdapter, SpotifyTokenRefreshService, SpotifyDeviceService],
})
export class SpotifyPlaybackModule {}
