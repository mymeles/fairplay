import { Module } from '@nestjs/common';
import { HostAuthGuard } from './host-auth.guard';
import { HostJwtService } from './host-jwt.service';
import { OAuthStateRepository } from './oauth-state.repository';
import { SpotifyAuthController } from './spotify-auth.controller';
import { SpotifyAuthService } from './spotify-auth.service';
import { SpotifyTokenRepository } from './spotify-token.repository';
import { UserRepository } from './user.repository';

@Module({
  controllers: [SpotifyAuthController],
  providers: [
    HostAuthGuard,
    HostJwtService,
    OAuthStateRepository,
    SpotifyAuthService,
    SpotifyTokenRepository,
    UserRepository,
  ],
  exports: [HostAuthGuard, HostJwtService, SpotifyTokenRepository, UserRepository],
})
export class SpotifyAuthModule {}
