import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import type { TrackDto } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import { ModerationService } from '../moderation/moderation.service';
import { RedisService } from '../redis/redis.service';
import { SessionService } from '../sessions/session.service';
import { SpotifyTokenRefreshService } from '../spotify-playback/spotify-token-refresh.service';
import type { SpotifyTrackItemDto } from './spotify-search.adapter';
import { SpotifySearchAdapter } from './spotify-search.adapter';
import { TrackNormalizer } from './track-normalizer';
import { TrackRepository } from './track.repository';

const SPOTIFY_SEARCH_LIMIT = 10;
const SEARCH_CACHE_TTL_SECONDS = 60;
const MAX_BACKOFF_SECONDS = 24 * 60 * 60;

@Injectable()
export class TrackSearchService {
  private readonly logger = new Logger(TrackSearchService.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly tokenRefresh: SpotifyTokenRefreshService,
    private readonly spotify: SpotifySearchAdapter,
    private readonly normalizer: TrackNormalizer,
    private readonly tracks: TrackRepository,
    private readonly redis: RedisService,
    private readonly moderation: ModerationService,
  ) {}

  async search(sessionId: string, guestId: string, query: string): Promise<TrackDto[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new DomainError('VALIDATION_FAILED', 'Search query cannot be empty.');
    }

    await this.moderation.assertGuestCanSearch(sessionId, guestId);
    const session = await this.sessions.loadJoinable(sessionId);
    const queryHash = hashText(normalizedQuery);
    const cacheKey = searchCacheKey(
      sessionId,
      queryHash,
      session.settings.allowExplicitTracks,
    );
    const cached = await this.readSearchCache(cacheKey);
    if (cached) {
      const filteredCached = await this.moderation.filterAllowedTracks(sessionId, cached, {
        allowExplicitTracks: session.settings.allowExplicitTracks,
      });
      this.logger.log(
        { sessionId, guestId, queryHash, count: filteredCached.length, cacheHit: true },
        'Track search returned cached results.',
      );
      return filteredCached;
    }

    await this.throwIfSpotifyBackoffActive(session.hostUserId);

    try {
      const spotifyTracks = await this.callWithAuthRetry(session.hostUserId, (token) =>
        this.spotify.searchTracks(token, normalizedQuery, SPOTIFY_SEARCH_LIMIT),
      );
      const normalized = this.normalizer.normalizeMany(spotifyTracks);
      const filtered = await this.moderation.filterAllowedTracks(sessionId, normalized, {
        allowExplicitTracks: session.settings.allowExplicitTracks,
      });

      await this.writeSearchCache(cacheKey, filtered);
      this.logger.log(
        {
          sessionId,
          guestId,
          hostUserId: session.hostUserId,
          queryHash,
          resultCount: filtered.length,
          droppedMalformed: spotifyTracks.length - normalized.length,
          explicitAllowed: session.settings.allowExplicitTracks,
          cacheHit: false,
        },
        'Track search completed.',
      );
      return filtered;
    } catch (err) {
      if (err instanceof DomainError && err.code === 'SPOTIFY_RATE_LIMITED') {
        const retryAfterSec = normalizeRetryAfter(err.details.retryAfterSec);
        await this.storeSpotifyBackoff(session.hostUserId, retryAfterSec);
        this.logger.warn(
          { sessionId, guestId, hostUserId: session.hostUserId, retryAfterSec },
          'Spotify search rate limit encountered.',
        );
      }
      throw err;
    }
  }

  async searchForHost(sessionId: string, hostUserId: string, query: string): Promise<TrackDto[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new DomainError('VALIDATION_FAILED', 'Search query cannot be empty.');
    }

    const session = await this.sessions.getSession(sessionId, hostUserId);
    const queryHash = hashText(normalizedQuery);
    const cacheKey = searchCacheKey(
      sessionId,
      queryHash,
      session.settings.allowExplicitTracks,
    );
    const cached = await this.readSearchCache(cacheKey);
    if (cached) {
      return this.moderation.filterAllowedTracks(sessionId, cached, {
        allowExplicitTracks: session.settings.allowExplicitTracks,
      });
    }

    await this.throwIfSpotifyBackoffActive(hostUserId);

    try {
      const spotifyTracks = await this.callWithAuthRetry(hostUserId, (token) =>
        this.spotify.searchTracks(token, normalizedQuery, SPOTIFY_SEARCH_LIMIT),
      );
      const normalized = this.normalizer.normalizeMany(spotifyTracks);
      const filtered = await this.moderation.filterAllowedTracks(sessionId, normalized, {
        allowExplicitTracks: session.settings.allowExplicitTracks,
      });
      await this.writeSearchCache(cacheKey, filtered);
      this.logger.log(
        { sessionId, hostUserId, queryHash, resultCount: filtered.length },
        'Host track search completed.',
      );
      return filtered;
    } catch (err) {
      if (err instanceof DomainError && err.code === 'SPOTIFY_RATE_LIMITED') {
        const retryAfterSec = normalizeRetryAfter(err.details.retryAfterSec);
        await this.storeSpotifyBackoff(hostUserId, retryAfterSec);
        this.logger.warn(
          { sessionId, hostUserId, retryAfterSec },
          'Spotify host search rate limit encountered.',
        );
      }
      throw err;
    }
  }

  async normalizeTrack(
    sessionId: string,
    guestId: string,
    spotifyTrack: SpotifyTrackItemDto,
  ): Promise<TrackDto> {
    await this.moderation.assertGuestCanSearch(sessionId, guestId);
    const session = await this.sessions.loadJoinable(sessionId);
    const normalized = this.normalizer.normalize(spotifyTrack);
    if (!normalized) {
      throw new DomainError('VALIDATION_FAILED', 'Spotify track could not be normalized.');
    }
    await this.moderation.assertTrackAllowed(sessionId, normalized, {
      allowExplicitTracks: session.settings.allowExplicitTracks,
    });

    await this.tracks.upsert(normalized);
    this.logger.log(
      {
        sessionId,
        guestId,
        spotifyTrackId: normalized.spotifyTrackId,
        explicit: normalized.explicit,
      },
      'Track normalized and stored.',
    );
    return normalized;
  }

  private async callWithAuthRetry<T>(
    hostUserId: string,
    fn: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const token = await this.tokenRefresh.getValidAccessToken(hostUserId);
    try {
      return await fn(token);
    } catch (err) {
      if (err instanceof DomainError && err.code === 'SPOTIFY_AUTH_FAILED') {
        const refreshed = await this.tokenRefresh.forceRefresh(hostUserId);
        return fn(refreshed);
      }
      throw err;
    }
  }

  private async readSearchCache(key: string): Promise<TrackDto[] | null> {
    try {
      const raw = await this.redis.getClient().get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || !parsed.every(isTrackDto)) {
        this.logger.warn({ key }, 'Ignoring malformed track search cache entry.');
        return null;
      }
      return parsed;
    } catch (err) {
      this.logger.warn({ err, key }, 'Track search cache read failed.');
      return null;
    }
  }

  private async writeSearchCache(key: string, tracks: TrackDto[]): Promise<void> {
    try {
      await this.redis
        .getClient()
        .set(key, JSON.stringify(tracks), 'EX', SEARCH_CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn({ err, key }, 'Track search cache write failed.');
    }
  }

  private async throwIfSpotifyBackoffActive(hostUserId: string): Promise<void> {
    const key = spotifyBackoffKey(hostUserId);
    try {
      const active = await this.redis.getClient().get(key);
      if (!active) return;
      const ttl = await this.redis.getClient().ttl(key);
      throw new DomainError('SPOTIFY_RATE_LIMITED', 'Spotify search is temporarily rate limited.', {
        retryAfterSec: ttl > 0 ? ttl : null,
      });
    } catch (err) {
      if (err instanceof DomainError) throw err;
      this.logger.warn({ err, hostUserId }, 'Spotify search backoff check failed.');
    }
  }

  private async storeSpotifyBackoff(hostUserId: string, retryAfterSec: number): Promise<void> {
    try {
      await this.redis.getClient().set(spotifyBackoffKey(hostUserId), '1', 'EX', retryAfterSec);
    } catch (err) {
      this.logger.warn({ err, hostUserId, retryAfterSec }, 'Spotify search backoff write failed.');
    }
  }
}

const searchCacheKey = (
  sessionId: string,
  queryHash: string,
  explicitAllowed: boolean,
): string => `party:${sessionId}:track-search:${explicitAllowed ? 'explicit' : 'clean'}:${queryHash}`;

const spotifyBackoffKey = (hostUserId: string): string =>
  `spotify:search:backoff:${hostUserId}`;

const hashText = (value: string): string =>
  createHash('sha256').update(value.toLowerCase()).digest('hex').slice(0, 16);

const normalizeRetryAfter = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_BACKOFF_SECONDS);
};

const isTrackDto = (value: unknown): value is TrackDto => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof TrackDto, unknown>>;
  return (
    typeof candidate.spotifyUri === 'string' &&
    typeof candidate.spotifyTrackId === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.artist === 'string' &&
    typeof candidate.durationMs === 'number' &&
    typeof candidate.explicit === 'boolean' &&
    (candidate.album === undefined || typeof candidate.album === 'string') &&
    (candidate.artworkUrl === undefined || typeof candidate.artworkUrl === 'string')
  );
};
