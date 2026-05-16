import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface SpotifyTokenRecord {
  userId: string;
  encryptedRefreshToken: string;
  encryptedAccessToken: string | null;
  expiresAt: Date;
  scopes: string[];
  updatedAt: Date;
}

export interface SpotifyTokenRefreshUpdate {
  encryptedAccessToken: string;
  encryptedRefreshToken?: string;
  expiresAt: Date;
  scopes?: string[];
}

@Injectable()
export class SpotifyTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<SpotifyTokenRecord | null> {
    const row = await this.prisma.spotifyToken.findUnique({ where: { userId } });
    if (!row) return null;
    return {
      userId: row.userId,
      encryptedRefreshToken: row.encryptedRefreshToken,
      encryptedAccessToken: row.encryptedAccessToken,
      expiresAt: row.expiresAt,
      scopes: row.scopes,
      updatedAt: row.updatedAt,
    };
  }

  async deleteByUserId(userId: string): Promise<boolean> {
    const deleted = await this.prisma.spotifyToken.deleteMany({ where: { userId } });
    return deleted.count > 0;
  }

  async updateAfterRefresh(userId: string, update: SpotifyTokenRefreshUpdate): Promise<void> {
    await this.prisma.spotifyToken.update({
      where: { userId },
      data: {
        encryptedAccessToken: update.encryptedAccessToken,
        expiresAt: update.expiresAt,
        ...(update.encryptedRefreshToken
          ? { encryptedRefreshToken: update.encryptedRefreshToken }
          : {}),
        ...(update.scopes ? { scopes: update.scopes } : {}),
      },
    });
  }
}
