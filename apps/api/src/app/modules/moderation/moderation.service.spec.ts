import { DomainError } from '@fairplay/shared-utils';
import type { PrismaService } from '../database/prisma.service';
import type { BlacklistService } from './blacklist.service';
import { ModerationService } from './moderation.service';
import type { RateLimitService } from './rate-limit.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const GUEST_ID = '22222222-2222-2222-2222-222222222222';

const makePrisma = (status = 'ACTIVE'): jest.Mocked<PrismaService> =>
  ({
    sessionGuest: {
      findUnique: jest.fn().mockResolvedValue({ sessionId: SESSION_ID, status }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  }) as unknown as jest.Mocked<PrismaService>;

const makeRateLimits = (): jest.Mocked<RateLimitService> =>
  ({
    assertAllowed: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<RateLimitService>;

const makeBlacklist = (): jest.Mocked<BlacklistService> =>
  ({
    assertTrackAllowed: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<BlacklistService>;

describe('ModerationService', () => {
  it('blocks muted guests from queue mutations', async () => {
    const service = new ModerationService(makePrisma('MUTED'), makeRateLimits(), makeBlacklist());

    await expect(
      service.assertGuestCanMutateQueue(SESSION_ID, GUEST_ID, 'queue_add'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      details: { guestStatus: 'MUTED', action: 'queue_add' },
    });
  });

  it('blocks banned guests from read/search flows', async () => {
    const service = new ModerationService(makePrisma('BANNED'), makeRateLimits(), makeBlacklist());

    await expect(service.assertGuestCanSearch(SESSION_ID, GUEST_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      details: { guestStatus: 'BANNED' },
    });
  });

  it('rate-limits join attempts and rejects banned devices', async () => {
    const prisma = makePrisma();
    (prisma.sessionGuest.findFirst as jest.Mock).mockResolvedValueOnce({ id: GUEST_ID });
    const rateLimits = makeRateLimits();
    const service = new ModerationService(prisma, rateLimits, makeBlacklist());

    await expect(
      service.assertJoinAllowed(SESSION_ID, { displayName: 'A', deviceHash: 'device-1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(rateLimits.assertAllowed).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'join', keyParts: [SESSION_ID, 'device-1'] }),
    );
  });

  it('rejects explicit tracks when a session disables them', async () => {
    const service = new ModerationService(makePrisma(), makeRateLimits(), makeBlacklist());

    await expect(
      service.assertTrackAllowed(
        SESSION_ID,
        {
          spotifyUri: 'spotify:track:abc',
          spotifyTrackId: 'abc',
          title: 'Song',
          artist: 'Artist',
          durationMs: 180_000,
          explicit: true,
        },
        { allowExplicitTracks: false },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('filters disallowed search results without failing the whole search', async () => {
    const blacklist = makeBlacklist();
    blacklist.assertTrackAllowed
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new DomainError('FORBIDDEN', 'blocked'));
    const service = new ModerationService(makePrisma(), makeRateLimits(), blacklist);

    const result = await service.filterAllowedTracks(
      SESSION_ID,
      [
        {
          spotifyUri: 'spotify:track:clean',
          spotifyTrackId: 'clean',
          title: 'Clean',
          artist: 'Artist',
          durationMs: 180_000,
          explicit: false,
        },
        {
          spotifyUri: 'spotify:track:blocked',
          spotifyTrackId: 'blocked',
          title: 'Blocked',
          artist: 'Artist',
          durationMs: 180_000,
          explicit: false,
        },
      ],
      { allowExplicitTracks: true },
    );

    expect(result.map((track) => track.spotifyTrackId)).toEqual(['clean']);
  });
});
