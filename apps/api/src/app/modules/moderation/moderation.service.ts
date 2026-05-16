import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { GuestStatus, TrackDto } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import { PrismaService } from '../database/prisma.service';
import { BlacklistService } from './blacklist.service';
import { RateLimitService } from './rate-limit.service';

export interface JoinModerationInput {
  displayName: string;
  deviceHash?: string;
}

export type GuestMutationAction =
  | 'queue_add'
  | 'queue_remove'
  | 'vote'
  | 'boost'
  | 'challenge';

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimits: RateLimitService,
    private readonly blacklist: BlacklistService,
  ) {}

  async assertJoinAllowed(sessionId: string, input: JoinModerationInput): Promise<void> {
    const subject = input.deviceHash ?? hashText(input.displayName.trim().toLowerCase());
    await this.rateLimits.assertAllowed({
      bucket: 'join',
      keyParts: [sessionId, subject],
      capacity: 6,
      refillWindowSeconds: 60,
      message: 'Too many join attempts. Slow down and try again shortly.',
    });

    if (!input.deviceHash) return;
    const banned = await this.prisma.sessionGuest.findFirst({
      where: { sessionId, deviceHash: input.deviceHash, status: 'BANNED' },
      select: { id: true },
      orderBy: { joinedAt: 'desc' },
    });
    if (banned) {
      throw new DomainError('FORBIDDEN', 'This device is banned from the session.');
    }
  }

  async assertGuestCanSearch(sessionId: string, guestId: string): Promise<void> {
    await this.rateLimits.assertAllowed({
      bucket: 'search',
      keyParts: [sessionId, guestId],
      capacity: 20,
      refillWindowSeconds: 60,
      message: 'You are searching too quickly. Slow down and try again shortly.',
    });
    await this.assertGuestNotBanned(sessionId, guestId);
  }

  async assertGuestCanReadQueue(sessionId: string, guestId: string): Promise<void> {
    await this.assertGuestNotBanned(sessionId, guestId);
  }

  async assertGuestCanMutateQueue(
    sessionId: string,
    guestId: string,
    action: GuestMutationAction,
  ): Promise<void> {
    if (action === 'queue_add') {
      await this.rateLimits.assertAllowed({
        bucket: 'queue_add',
        keyParts: [sessionId, guestId],
        capacity: 8,
        refillWindowSeconds: 60,
        message: 'You are adding tracks too quickly. Slow down and try again shortly.',
      });
    }
    if (action === 'vote') {
      await this.rateLimits.assertAllowed({
        bucket: 'vote',
        keyParts: [sessionId, guestId],
        capacity: 12,
        refillWindowSeconds: 10,
        message: 'You are voting too quickly. Slow down and try again shortly.',
      });
    }
    if (action === 'boost' || action === 'challenge') {
      await this.rateLimits.assertAllowed({
        bucket: 'token_spend',
        keyParts: [sessionId, guestId],
        capacity: 10,
        refillWindowSeconds: 60,
        message: 'You are spending tokens too quickly. Slow down and try again shortly.',
      });
    }

    await this.assertGuestActive(sessionId, guestId, action);
  }

  async assertTrackAllowed(
    sessionId: string,
    track: TrackDto,
    options: { allowExplicitTracks: boolean },
  ): Promise<void> {
    if (!options.allowExplicitTracks && track.explicit) {
      throw new DomainError('VALIDATION_FAILED', 'This session does not allow explicit tracks.');
    }
    await this.blacklist.assertTrackAllowed(sessionId, track);
  }

  async filterAllowedTracks(
    sessionId: string,
    tracks: TrackDto[],
    options: { allowExplicitTracks: boolean },
  ): Promise<TrackDto[]> {
    const allowed: TrackDto[] = [];
    for (const track of tracks) {
      try {
        await this.assertTrackAllowed(sessionId, track, options);
        allowed.push(track);
      } catch (err) {
        if (err instanceof DomainError && (err.code === 'VALIDATION_FAILED' || err.code === 'FORBIDDEN')) {
          continue;
        }
        throw err;
      }
    }
    return allowed;
  }

  private async assertGuestNotBanned(sessionId: string, guestId: string): Promise<void> {
    const guest = await this.loadGuest(sessionId, guestId);
    if (guest.status === 'BANNED' || guest.status === 'LEFT') {
      throw new DomainError('FORBIDDEN', 'Guest is not allowed in this session.', {
        guestStatus: guest.status,
      });
    }
  }

  private async assertGuestActive(
    sessionId: string,
    guestId: string,
    action: GuestMutationAction,
  ): Promise<void> {
    const guest = await this.loadGuest(sessionId, guestId);
    if (guest.status !== 'ACTIVE') {
      throw new DomainError('FORBIDDEN', 'Guest cannot affect the queue in this session.', {
        guestStatus: guest.status,
        action,
      });
    }
  }

  private async loadGuest(sessionId: string, guestId: string): Promise<{ status: GuestStatus }> {
    const guest = await this.prisma.sessionGuest.findUnique({
      where: { id: guestId },
      select: { sessionId: true, status: true },
    });
    if (!guest || guest.sessionId !== sessionId) {
      throw new DomainError('FORBIDDEN', 'Guest token is scoped to a different session.');
    }
    return { status: guest.status as GuestStatus };
  }
}

const hashText = (value: string): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 24);
