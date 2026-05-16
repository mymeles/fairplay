import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface UserRecord {
  id: string;
  email: string | null;
  displayName: string | null;
  spotifyUserId: string | null;
  selectedDeviceId: string | null;
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      spotifyUserId: row.spotifyUserId,
      selectedDeviceId: row.selectedDeviceId,
    };
  }

  async setSelectedDeviceId(userId: string, deviceId: string | null): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { selectedDeviceId: deviceId },
    });
  }
}
