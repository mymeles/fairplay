import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { SpotifyAuthModule } from '../spotify-auth/spotify-auth.module';
import { HostDeviceController } from './host-device.controller';
import { SpotifyDeviceService } from './spotify-device.service';
import { SpotifyPlaybackAdapter } from './spotify-playback.adapter';
import { SpotifyTokenRefreshService } from './spotify-token-refresh.service';

@Module({
  imports: [SpotifyAuthModule, RedisModule],
  controllers: [HostDeviceController],
  providers: [SpotifyPlaybackAdapter, SpotifyTokenRefreshService, SpotifyDeviceService],
  exports: [SpotifyPlaybackAdapter, SpotifyTokenRefreshService, SpotifyDeviceService],
})
export class SpotifyPlaybackModule {}
