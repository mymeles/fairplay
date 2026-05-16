import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { generatePkcePair, generateState } from './pkce';
import { SPOTIFY_SCOPES } from './spotify-scopes';
import { OAuthStateRepository } from './oauth-state.repository';
import { SpotifyTokenRepository } from './spotify-token.repository';

const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_REFRESH_LEEWAY_SEC = 60;

export interface LoginRedirect {
  authorizeUrl: string;
  state: string;
  expiresAt: Date;
}

export interface HostStatus {
  connected: boolean;
  scopes: string[];
  expiresAt: string | null;
  refreshDue: boolean;
}

@Injectable()
export class SpotifyAuthService {
  private readonly logger = new Logger(SpotifyAuthService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly oauthStates: OAuthStateRepository,
    private readonly tokens: SpotifyTokenRepository,
  ) {}

  async buildLoginRedirect(redirectTo?: string): Promise<LoginRedirect> {
    const pkce = generatePkcePair();
    const state = generateState();

    const record = await this.oauthStates.create(state, pkce.verifier, redirectTo);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.spotifyClientId,
      redirect_uri: this.config.spotifyRedirectUri,
      code_challenge: pkce.challenge,
      code_challenge_method: pkce.method,
      scope: SPOTIFY_SCOPES.join(' '),
      state,
    });

    const authorizeUrl = `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`;
    this.logger.log({ state, scopes: SPOTIFY_SCOPES }, 'Spotify login initiated.');
    return { authorizeUrl, state, expiresAt: record.expiresAt };
  }

  async getHostStatus(userId: string): Promise<HostStatus> {
    const token = await this.tokens.findByUserId(userId);
    if (!token) {
      return { connected: false, scopes: [], expiresAt: null, refreshDue: false };
    }
    const refreshDue =
      token.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_LEEWAY_SEC * 1000;
    return {
      connected: true,
      scopes: token.scopes,
      expiresAt: token.expiresAt.toISOString(),
      refreshDue,
    };
  }

  async logout(userId: string): Promise<boolean> {
    const removed = await this.tokens.deleteByUserId(userId);
    this.logger.log({ userId, removed }, 'Host Spotify logout.');
    return removed;
  }
}
