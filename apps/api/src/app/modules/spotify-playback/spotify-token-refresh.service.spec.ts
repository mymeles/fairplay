import type { TokenEncryptionService } from '@fairplay/shared-utils';
import type { AppConfigService } from '../config/app-config.service';
import type { SpotifyTokenRepository } from '../spotify-auth/spotify-token.repository';
import { Fetcher } from './spotify-playback.adapter';
import { SpotifyTokenRefreshService } from './spotify-token-refresh.service';

const config = { spotifyClientId: 'cid' } as AppConfigService;

const makeCrypto = (): jest.Mocked<TokenEncryptionService> =>
  ({
    encrypt: jest.fn((s: string) => `enc(${s})`),
    decrypt: jest.fn((s: string) => s.replace(/^enc\(/, '').replace(/\)$/, '')),
  }) as unknown as jest.Mocked<TokenEncryptionService>;

const makeRepo = (
  initial: {
    encryptedRefreshToken: string;
    encryptedAccessToken: string | null;
    expiresAt: Date;
  } | null,
): jest.Mocked<SpotifyTokenRepository> => {
  let row = initial
    ? { userId: 'user-1', scopes: ['x'], updatedAt: new Date(), ...initial }
    : null;
  return {
    findByUserId: jest.fn().mockImplementation(async () => row),
    deleteByUserId: jest.fn(),
    updateAfterRefresh: jest.fn().mockImplementation(async (_userId, update) => {
      row = {
        ...row!,
        encryptedAccessToken: update.encryptedAccessToken,
        expiresAt: update.expiresAt,
        encryptedRefreshToken: update.encryptedRefreshToken ?? row!.encryptedRefreshToken,
        scopes: update.scopes ?? row!.scopes,
      };
    }),
  } as unknown as jest.Mocked<SpotifyTokenRepository>;
};

const tokenJson = (overrides: Partial<{ access_token: string; refresh_token: string; expires_in: number; scope: string }> = {}): Response =>
  new Response(
    JSON.stringify({
      access_token: 'AT-NEW',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user-read-playback-state',
      ...overrides,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

describe('SpotifyTokenRefreshService.getValidAccessToken', () => {
  it('returns the cached access token when it is still fresh', async () => {
    const tomorrow = new Date(Date.now() + 60 * 60 * 1000);
    const repo = makeRepo({
      encryptedRefreshToken: 'enc(RT)',
      encryptedAccessToken: 'enc(AT-CACHED)',
      expiresAt: tomorrow,
    });
    const fetcher = jest.fn() as jest.MockedFunction<Fetcher>;
    const svc = new SpotifyTokenRefreshService(config, repo, makeCrypto(), fetcher);

    await expect(svc.getValidAccessToken('user-1')).resolves.toBe('AT-CACHED');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refreshes when the access token is missing', async () => {
    const repo = makeRepo({
      encryptedRefreshToken: 'enc(RT-1)',
      encryptedAccessToken: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const fetcher = jest.fn().mockResolvedValue(tokenJson()) as jest.MockedFunction<Fetcher>;
    const svc = new SpotifyTokenRefreshService(config, repo, makeCrypto(), fetcher);

    await expect(svc.getValidAccessToken('user-1')).resolves.toBe('AT-NEW');
    expect(repo.updateAfterRefresh).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ encryptedAccessToken: 'enc(AT-NEW)' }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      'https://accounts.spotify.com/api/token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('refreshes when the cached access token is within the leeway window', async () => {
    const repo = makeRepo({
      encryptedRefreshToken: 'enc(RT-1)',
      encryptedAccessToken: 'enc(AT-OLD)',
      expiresAt: new Date(Date.now() + 30 * 1000), // < leeway
    });
    const fetcher = jest.fn().mockResolvedValue(tokenJson()) as jest.MockedFunction<Fetcher>;
    const svc = new SpotifyTokenRefreshService(config, repo, makeCrypto(), fetcher);
    await expect(svc.getValidAccessToken('user-1')).resolves.toBe('AT-NEW');
  });

  it('rotates the refresh token if Spotify returns a new one', async () => {
    const repo = makeRepo({
      encryptedRefreshToken: 'enc(RT-1)',
      encryptedAccessToken: null,
      expiresAt: new Date(),
    });
    const fetcher = jest
      .fn()
      .mockResolvedValue(tokenJson({ refresh_token: 'RT-ROT' })) as jest.MockedFunction<Fetcher>;
    const svc = new SpotifyTokenRefreshService(config, repo, makeCrypto(), fetcher);
    await svc.getValidAccessToken('user-1');
    expect(repo.updateAfterRefresh).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ encryptedRefreshToken: 'enc(RT-ROT)' }),
    );
  });

  it('throws SPOTIFY_AUTH_FAILED when Spotify returns 400', async () => {
    const repo = makeRepo({
      encryptedRefreshToken: 'enc(RT)',
      encryptedAccessToken: null,
      expiresAt: new Date(),
    });
    const fetcher = jest
      .fn()
      .mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 })) as jest.MockedFunction<Fetcher>;
    const svc = new SpotifyTokenRefreshService(config, repo, makeCrypto(), fetcher);
    await expect(svc.getValidAccessToken('user-1')).rejects.toMatchObject({
      code: 'SPOTIFY_AUTH_FAILED',
    });
  });

  it('throws UNAUTHORIZED when no token row exists', async () => {
    const repo = makeRepo(null);
    const fetcher = jest.fn() as jest.MockedFunction<Fetcher>;
    const svc = new SpotifyTokenRefreshService(config, repo, makeCrypto(), fetcher);
    await expect(svc.getValidAccessToken('user-1')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('SpotifyTokenRefreshService.forceRefresh', () => {
  it('always hits Spotify even if the cached token is fresh', async () => {
    const repo = makeRepo({
      encryptedRefreshToken: 'enc(RT)',
      encryptedAccessToken: 'enc(AT-CACHED)',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const fetcher = jest.fn().mockResolvedValue(tokenJson()) as jest.MockedFunction<Fetcher>;
    const svc = new SpotifyTokenRefreshService(config, repo, makeCrypto(), fetcher);
    await svc.forceRefresh('user-1');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
