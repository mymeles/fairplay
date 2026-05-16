import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface OAuthStateRecord {
  state: string;
  codeVerifier: string;
  redirectTo: string | null;
  expiresAt: Date;
}

@Injectable()
export class OAuthStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(state: string, codeVerifier: string, redirectTo?: string): Promise<OAuthStateRecord> {
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);
    const row = await this.prisma.oAuthState.create({
      data: {
        state,
        codeVerifier,
        redirectTo: redirectTo ?? null,
        expiresAt,
      },
    });
    return {
      state: row.state,
      codeVerifier: row.codeVerifier,
      redirectTo: row.redirectTo,
      expiresAt: row.expiresAt,
    };
  }

  async deleteExpired(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.oAuthState.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  }
}
