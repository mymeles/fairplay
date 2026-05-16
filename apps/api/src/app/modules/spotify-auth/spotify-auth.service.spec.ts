import { SpotifyAuthService } from './spotify-auth.service';
import type { AppConfigService } from '../config/app-config.service';
import type { OAuthStateRepository } from './oauth-state.repository';
import type { SpotifyTokenRepository, SpotifyTokenRecord } from './spotify-token.repository';
import { SPOTIFY_SCOPES } from './spotify-scopes';

const makeConfig = (overrides: Partial<AppConfigService> = {}): AppConfigService =>
  ({
    spotifyClientId: 'cid',
    spotifyRedirectUri: 'https://example.supabase.co/functions/v1/spotify-callback',
    ...overrides,
  }) as AppConfigService;

const makeStates = (created: jest.Mock): OAuthStateRepository =>
  ({ create: created, deleteExpired: jest.fn() }) as unknown as OAuthStateRepository;

const makeTokens = (
  find: jest.Mock<Promise<SpotifyTokenRecord | null>, [string]>,
  del: jest.Mock<Promise<boolean>, [string]> = jest.fn(),
): SpotifyTokenRepository =>
  ({ findByUserId: find, deleteByUserId: del }) as unknown as SpotifyTokenRepository;

describe('SpotifyAuthService.buildLoginRedirect', () => {
  it('persists a state row and returns an authorize URL with required params', async () => {
    const create = jest
      .fn()
      .mockResolvedValue({
        state: 'STATE',
        codeVerifier: 'VERIFIER',
        redirectTo: null,
        expiresAt: new Date('2099-01-01T00:00:00Z'),
      });

    const service = new SpotifyAuthService(makeConfig(), makeStates(create), makeTokens(jest.fn()));
    const result = await service.buildLoginRedirect();

    expect(create).toHaveBeenCalledTimes(1);
    const [stateArg, verifierArg, redirectArg] = create.mock.calls[0];
    expect(typeof stateArg).toBe('string');
    expect(typeof verifierArg).toBe('string');
    expect(redirectArg).toBeUndefined();

    const url = new URL(result.authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://example.supabase.co/functions/v1/spotify-callback',
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('scope')).toBe(SPOTIFY_SCOPES.join(' '));
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('forwards the redirectTo parameter to the state row', async () => {
    const create = jest.fn().mockResolvedValue({
      state: 's',
      codeVerifier: 'v',
      redirectTo: 'http://web/auth/complete',
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    });
    const service = new SpotifyAuthService(makeConfig(), makeStates(create), makeTokens(jest.fn()));
    await service.buildLoginRedirect('http://web/auth/complete');
    expect(create.mock.calls[0][2]).toBe('http://web/auth/complete');
  });
});

describe('SpotifyAuthService.getHostStatus', () => {
  it('reports disconnected when no token row exists', async () => {
    const service = new SpotifyAuthService(
      makeConfig(),
      makeStates(jest.fn()),
      makeTokens(jest.fn().mockResolvedValue(null)),
    );
    expect(await service.getHostStatus('user-1')).toEqual({
      connected: false,
      scopes: [],
      expiresAt: null,
      refreshDue: false,
    });
  });

  it('reports connected with scopes and refreshDue=false when token is fresh', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const service = new SpotifyAuthService(
      makeConfig(),
      makeStates(jest.fn()),
      makeTokens(
        jest.fn().mockResolvedValue({
          userId: 'user-1',
          encryptedRefreshToken: 'cipher',
          encryptedAccessToken: null,
          expiresAt: tomorrow,
          scopes: ['user-read-playback-state'],
          updatedAt: new Date(),
        }),
      ),
    );
    const status = await service.getHostStatus('user-1');
    expect(status.connected).toBe(true);
    expect(status.scopes).toEqual(['user-read-playback-state']);
    expect(status.refreshDue).toBe(false);
  });

  it('flags refreshDue=true when the access token is within the leeway window', async () => {
    const inThirtySeconds = new Date(Date.now() + 30 * 1000);
    const service = new SpotifyAuthService(
      makeConfig(),
      makeStates(jest.fn()),
      makeTokens(
        jest.fn().mockResolvedValue({
          userId: 'user-1',
          encryptedRefreshToken: 'cipher',
          expiresAt: inThirtySeconds,
          scopes: ['user-read-playback-state'],
          updatedAt: new Date(),
        }),
      ),
    );
    const status = await service.getHostStatus('user-1');
    expect(status.refreshDue).toBe(true);
  });
});

describe('SpotifyAuthService.logout', () => {
  it('returns true when a token row was deleted', async () => {
    const del = jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true);
    const service = new SpotifyAuthService(
      makeConfig(),
      makeStates(jest.fn()),
      makeTokens(jest.fn().mockResolvedValue(null), del),
    );
    await expect(service.logout('user-1')).resolves.toBe(true);
    expect(del).toHaveBeenCalledWith('user-1');
  });

  it('returns false when there was nothing to delete', async () => {
    const service = new SpotifyAuthService(
      makeConfig(),
      makeStates(jest.fn()),
      makeTokens(jest.fn().mockResolvedValue(null), jest.fn().mockResolvedValue(false)),
    );
    await expect(service.logout('user-1')).resolves.toBe(false);
  });
});
