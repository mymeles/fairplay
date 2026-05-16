import { Injectable, Logger } from '@nestjs/common';
import type { DependencyHealthReport, HealthReport } from '@fairplay/shared-types';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

const SERVICE_NAME = 'fairplay-api';
const SERVICE_VERSION = process.env.npm_package_version ?? '0.1.0';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  getServiceHealth(): HealthReport {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      version: SERVICE_VERSION,
      checkedAt: new Date().toISOString(),
    };
  }

  async getDatabaseHealth(): Promise<DependencyHealthReport> {
    try {
      const latencyMs = await this.prisma.ping();
      return {
        status: 'ok',
        dependency: 'postgres',
        latencyMs,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error({ err }, 'Postgres health check failed');
      return {
        status: 'down',
        dependency: 'postgres',
        latencyMs: null,
        checkedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'unknown error',
      };
    }
  }

  async getRedisHealth(): Promise<DependencyHealthReport> {
    try {
      const latencyMs = await this.redis.ping();
      return {
        status: 'ok',
        dependency: 'redis',
        latencyMs,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error({ err }, 'Redis health check failed');
      return {
        status: 'down',
        dependency: 'redis',
        latencyMs: null,
        checkedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'unknown error',
      };
    }
  }
}
