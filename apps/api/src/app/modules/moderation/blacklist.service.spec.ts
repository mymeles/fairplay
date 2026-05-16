import type { PrismaService } from '../database/prisma.service';
import { BlacklistService, normalizeArtistName } from './blacklist.service';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const HOST_ID = '22222222-2222-2222-2222-222222222222';

const makePrisma = (): jest.Mocked<PrismaService> =>
  ({
    partySession: {
      findUnique: jest.fn().mockResolvedValue({ id: SESSION_ID, hostUserId: HOST_ID }),
    },
    sessionTrackBlacklist: {
      upsert: jest.fn().mockResolvedValue({
        id: '33333333-3333-3333-3333-333333333333',
        sessionId: SESSION_ID,
        spotifyTrackId: 'track123',
        spotifyUri: 'spotify:track:track123',
        title: 'Nope',
        createdByUserId: HOST_ID,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    sessionArtistBlacklist: {
      upsert: jest.fn().mockResolvedValue({
        id: '44444444-4444-4444-4444-444444444444',
        sessionId: SESSION_ID,
        artistName: 'Bad Artist',
        normalizedArtistName: 'bad artist',
        createdByUserId: HOST_ID,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  }) as unknown as jest.Mocked<PrismaService>;

const track = {
  spotifyUri: 'spotify:track:track123',
  spotifyTrackId: 'track123',
  title: 'Nope',
  artist: 'Bad Artist, Friend',
  durationMs: 180_000,
  explicit: false,
};

describe('BlacklistService', () => {
  it('blacklists a track for a host-owned session', async () => {
    const prisma = makePrisma();
    const service = new BlacklistService(prisma);

    const result = await service.blacklistTrack(SESSION_ID, HOST_ID, {
      spotifyUri: 'spotify:track:track123',
      title: 'Nope',
    });

    expect(prisma.sessionTrackBlacklist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId_spotifyTrackId: { sessionId: SESSION_ID, spotifyTrackId: 'track123' } },
      }),
    );
    expect(result.spotifyTrackId).toBe('track123');
  });

  it('rejects moderation from a non-owner host', async () => {
    const prisma = makePrisma();
    (prisma.partySession.findUnique as jest.Mock).mockResolvedValueOnce({
      id: SESSION_ID,
      hostUserId: '99999999-9999-9999-9999-999999999999',
    });
    const service = new BlacklistService(prisma);

    await expect(
      service.blacklistArtist(SESSION_ID, HOST_ID, { artistName: 'Bad Artist' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a blacklisted track', async () => {
    const prisma = makePrisma();
    (prisma.sessionTrackBlacklist.findUnique as jest.Mock).mockResolvedValueOnce({
      id: '33333333-3333-3333-3333-333333333333',
    });
    const service = new BlacklistService(prisma);

    await expect(service.assertTrackAllowed(SESSION_ID, track)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      details: { spotifyTrackId: 'track123' },
    });
  });

  it('rejects a blacklisted artist inside a multi-artist track', async () => {
    const prisma = makePrisma();
    (prisma.sessionArtistBlacklist.findFirst as jest.Mock).mockResolvedValueOnce({
      artistName: 'Bad Artist',
    });
    const service = new BlacklistService(prisma);

    await expect(service.assertTrackAllowed(SESSION_ID, track)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      details: { artistName: 'Bad Artist' },
    });
  });

  it('normalizes artist names consistently', () => {
    expect(normalizeArtistName('  BAD & Ártist!! ')).toBe('bad and artist');
  });
});
