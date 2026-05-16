import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DomainError, TokenEncryptionService } from '@fairplay/shared-utils';
import { AppConfigService } from '../config/app-config.service';
import { SpotifyTokenRepository } from '../spotify-auth/spotify-token.repository';
import { Fetcher, FETCHER } from './spotify-playback.adapter';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
// Refresh ahead of expiry so a request that takes >0ms to reach Spotify
// doesn't hit a token that just expired in flight.
const REFRESH_LEEWAY_MS = 60 * 1000;

interface SpotifyRefreshResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

@Injectable()
export class SpotifyTokenRefreshService {
  private readonly logger = new Logger(SpotifyTokenRefreshService.name);
  private readonly fetcher: Fetcher;

  constructor(
    private readonly config: AppConfigService,
    private readonly tokens: SpotifyTokenRepository,
    private readonly crypto: TokenEncryptionService,
    @Optional() @Inject(FETCHER) fetcher?: Fetcher,
  ) {
    this.fetcher = fetcher ?? fetch;
  }

  async getValidAccessToken(userId: string): Promise<string> {
    const row = await this.tokens.findByUserId(userId);
    if (!row) {
      throw new DomainError('UNAUTHORIZED', 'Host has not connected Spotify.');
    }
    const fresh =
      row.encryptedAccessToken &&
      row.expiresAt.getTime() - Date.now() > REFRESH_LEEWAY_MS;
    if (fresh) {
      return this.crypto.decrypt(row.encryptedAccessToken!);
    }
    return this.refreshAndStore(userId);
  }

  async forceRefresh(userId: string): Promise<string> {
    return this.refreshAndStore(userId);
  }

  private async refreshAndStore(userId: string): Promise<string> {
    const row = await this.tokens.findByUserId(userId);
    if (!row) {
      throw new DomainError('UNAUTHORIZED', 'Host has not connected Spotify.');
    }
    const refreshToken = this.crypto.decrypt(row.encryptedRefreshToken);

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.spotifyClientId,
    });

    const res = await this.fetcher(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (res.status === 400 || res.status === 401) {
      // Refresh token has been revoked / is invalid. Force the host to
      // reconnect via the OAuth flow.
      throw new DomainError('SPOTIFY_AUTH_FAILED', 'Spotify refresh token rejected.', {
        status: res.status,
      });
    }
    if (!res.ok) {
      throw new DomainError(
        'EXTERNAL_DEPENDENCY_FAILED',
        `Spotify token refresh failed (${res.status}).`,
        { status: res.status },
      );
    }

    const payload = (await res.json()) as SpotifyRefreshResponse;
    if (!payload.access_token || !payload.expires_in) {
      throw new DomainError(
        'EXTERNAL_DEPENDENCY_FAILED',
        'Spotify token response was malformed.',
      );
    }

    const expiresAt = new Date(Date.now() + payload.expires_in * 1000);
    const encryptedAccessToken = this.crypto.encrypt(payload.access_token);
    const encryptedRefreshToken = payload.refresh_token
      ? this.crypto.encrypt(payload.refresh_token)
      : undefined;
    const scopes = payload.scope ? payload.scope.split(' ').filter(Boolean) : undefined;

    await this.tokens.updateAfterRefresh(userId, {
      encryptedAccessToken,
      encryptedRefreshToken,
      expiresAt,
      scopes,
    });

    this.logger.log(
      { userId, rotatedRefresh: Boolean(encryptedRefreshToken) },
      'Spotify access token refreshed.',
    );
    return payload.access_token;
  }
}
