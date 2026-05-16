import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    this.client = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      enableReadyCheck: true,
    });
    this.client.on('error', (err) => this.logger.error({ err }, 'Redis connection error'));
    await this.client.connect();
    this.logger.log('Redis connection established.');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.logger.log('Redis connection closed.');
    }
  }

  getClient(): Redis {
    if (!this.client) throw new Error('Redis client not initialized.');
    return this.client;
  }

  async ping(): Promise<number> {
    const client = this.getClient();
    const startedAt = process.hrtime.bigint();
    const reply = await client.ping();
    const elapsedNs = process.hrtime.bigint() - startedAt;
    if (reply !== 'PONG') throw new Error(`Unexpected Redis PING reply: ${reply}`);
    return Number(elapsedNs / 1_000_000n);
  }
}
