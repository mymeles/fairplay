import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    super({ datasources: { db: { url: config.databaseUrl } } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Postgres connection established.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Postgres connection closed.');
  }

  async ping(): Promise<number> {
    const startedAt = process.hrtime.bigint();
    await this.$queryRawUnsafe('SELECT 1');
    const elapsedNs = process.hrtime.bigint() - startedAt;
    return Number(elapsedNs / 1_000_000n);
  }
}
