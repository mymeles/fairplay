import { Injectable, Logger } from '@nestjs/common';
import type { GuestStatus, QueueEntryStatus } from '@fairplay/shared-types';
import { DomainError } from '@fairplay/shared-utils';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RedisQueueRepository } from '../queue/redis-queue.repository';

export interface GuestDisciplineResult {
  guest: {
    id: string;
    sessionId: string;
    displayName: string;
    status: GuestStatus;
  };
  removedQueueEntryIds: string[];
}

const DISCIPLINE_REMOVABLE_STATUSES: QueueEntryStatus[] = ['PENDING', 'LOCKED'];

@Injectable()
export class GuestDisciplineService {
  private readonly logger = new Logger(GuestDisciplineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async muteGuest(
    sessionId: string,
    guestId: string,
    hostUserId: string,
  ): Promise<GuestDisciplineResult> {
    return this.setGuestStatus(sessionId, guestId, hostUserId, 'MUTED');
  }

  async banGuest(
    sessionId: string,
    guestId: string,
    hostUserId: string,
  ): Promise<GuestDisciplineResult> {
    return this.setGuestStatus(sessionId, guestId, hostUserId, 'BANNED');
  }

  async unmuteGuest(
    sessionId: string,
    guestId: string,
    hostUserId: string,
  ): Promise<GuestDisciplineResult> {
    await this.assertHostOwnsSession(sessionId, hostUserId);
    const guest = await this.loadGuest(sessionId, guestId);
    if (guest.status === 'BANNED') {
      throw new DomainError('CONFLICT', 'A banned guest cannot be unmuted.');
    }
    if (guest.status === 'LEFT') {
      throw new DomainError('CONFLICT', 'A guest who left cannot be unmuted.');
    }
    if (guest.status === 'ACTIVE') {
      return { guest: toGuestSummary(guest), removedQueueEntryIds: [] };
    }

    const updated = await this.prisma.sessionGuest.update({
      where: { id: guestId },
      data: { status: 'ACTIVE' },
    });
    this.logger.warn({ sessionId, guestId, hostUserId }, 'Guest unmuted by host.');
    return { guest: toGuestSummary(updated), removedQueueEntryIds: [] };
  }

  private async setGuestStatus(
    sessionId: string,
    guestId: string,
    hostUserId: string,
    status: Extract<GuestStatus, 'MUTED' | 'BANNED'>,
  ): Promise<GuestDisciplineResult> {
    await this.assertHostOwnsSession(sessionId, hostUserId);
    const guest = await this.loadGuest(sessionId, guestId);
    if (guest.status === 'LEFT') {
      throw new DomainError('CONFLICT', 'A guest who left cannot be moderated.');
    }
    if (status === 'MUTED' && guest.status === 'BANNED') {
      throw new DomainError('CONFLICT', 'A banned guest cannot be muted.');
    }

    const removable = await this.prisma.queueEntry.findMany({
      where: {
        sessionId,
        addedByGuestId: guestId,
        status: { in: DISCIPLINE_REMOVABLE_STATUSES },
      },
      select: { id: true },
    });
    const removedQueueEntryIds = removable.map((entry) => entry.id);
    const removedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedGuest = await tx.sessionGuest.update({
        where: { id: guestId },
        data: { status },
      });
      if (removedQueueEntryIds.length > 0) {
        await tx.queueEntry.updateMany({
          where: { id: { in: removedQueueEntryIds } },
          data: { status: 'REMOVED', removedAt },
        });
      }
      return updatedGuest;
    });

    await this.removeFromRedis(sessionId, removedQueueEntryIds);
    this.logger.warn(
      { sessionId, guestId, hostUserId, status, removedQueueEntryIds },
      status === 'BANNED' ? 'Guest banned by host.' : 'Guest muted by host.',
    );

    return { guest: toGuestSummary(updated), removedQueueEntryIds };
  }

  private async assertHostOwnsSession(sessionId: string, hostUserId: string): Promise<void> {
    const session = await this.prisma.partySession.findUnique({
      where: { id: sessionId },
      select: { hostUserId: true },
    });
    if (!session) {
      throw new DomainError('NOT_FOUND', 'Session not found.');
    }
    if (session.hostUserId !== hostUserId) {
      throw new DomainError('FORBIDDEN', 'Host does not own this session.');
    }
  }

  private async loadGuest(sessionId: string, guestId: string) {
    const guest = await this.prisma.sessionGuest.findUnique({ where: { id: guestId } });
    if (!guest || guest.sessionId !== sessionId) {
      throw new DomainError('NOT_FOUND', 'Guest not found for this session.');
    }
    return guest;
  }

  private async removeFromRedis(sessionId: string, entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) return;
    try {
      await this.redis
        .getClient()
        .zrem(RedisQueueRepository.pendingKey(sessionId), ...entryIds);
      await this.redis
        .getClient()
        .zrem(RedisQueueRepository.lockedKey(sessionId), ...entryIds);
    } catch (err) {
      this.logger.warn(
        { err, sessionId, count: entryIds.length },
        'Redis cleanup failed for moderated queue entries.',
      );
    }
  }
}

const toGuestSummary = (guest: {
  id: string;
  sessionId: string;
  displayName: string;
  status: string;
}): GuestDisciplineResult['guest'] => ({
  id: guest.id,
  sessionId: guest.sessionId,
  displayName: guest.displayName,
  status: guest.status as GuestStatus,
});
