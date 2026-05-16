import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import type { DependencyHealthReport, HealthReport } from '@fairplay/shared-types';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  getServiceHealth(): HealthReport {
    return this.health.getServiceHealth();
  }

  @Get('db')
  @HttpCode(HttpStatus.OK)
  getDatabaseHealth(): Promise<DependencyHealthReport> {
    return this.health.getDatabaseHealth();
  }

  @Get('redis')
  @HttpCode(HttpStatus.OK)
  getRedisHealth(): Promise<DependencyHealthReport> {
    return this.health.getRedisHealth();
  }
}
