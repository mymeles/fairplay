import { HealthService } from './health.service';
import type { PrismaService } from '../database/prisma.service';
import type { RedisService } from '../redis/redis.service';

const makePrisma = (impl: () => Promise<number>): PrismaService =>
  ({ ping: jest.fn(impl) }) as unknown as PrismaService;

const makeRedis = (impl: () => Promise<number>): RedisService =>
  ({ ping: jest.fn(impl) }) as unknown as RedisService;

describe('HealthService', () => {
  it('reports service health with the expected shape', () => {
    const service = new HealthService(makePrisma(async () => 0), makeRedis(async () => 0));
    const report = service.getServiceHealth();

    expect(report).toMatchObject({
      status: 'ok',
      service: 'fairplay-api',
    });
    expect(typeof report.uptimeSeconds).toBe('number');
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(typeof report.version).toBe('string');
    expect(new Date(report.checkedAt).toString()).not.toBe('Invalid Date');
  });

  it('reports postgres as ok when the ping succeeds', async () => {
    const service = new HealthService(makePrisma(async () => 7), makeRedis(async () => 0));
    const report = await service.getDatabaseHealth();

    expect(report.status).toBe('ok');
    expect(report.dependency).toBe('postgres');
    expect(report.latencyMs).toBe(7);
  });

  it('reports postgres as down with the error message when ping fails', async () => {
    const service = new HealthService(
      makePrisma(async () => {
        throw new Error('boom');
      }),
      makeRedis(async () => 0),
    );
    const report = await service.getDatabaseHealth();

    expect(report.status).toBe('down');
    expect(report.dependency).toBe('postgres');
    expect(report.latencyMs).toBeNull();
    expect(report.error).toBe('boom');
  });

  it('reports redis as ok when the ping succeeds', async () => {
    const service = new HealthService(makePrisma(async () => 0), makeRedis(async () => 3));
    const report = await service.getRedisHealth();

    expect(report.status).toBe('ok');
    expect(report.dependency).toBe('redis');
    expect(report.latencyMs).toBe(3);
  });

  it('reports redis as down with the error message when ping fails', async () => {
    const service = new HealthService(
      makePrisma(async () => 0),
      makeRedis(async () => {
        throw new Error('redis offline');
      }),
    );
    const report = await service.getRedisHealth();

    expect(report.status).toBe('down');
    expect(report.dependency).toBe('redis');
    expect(report.latencyMs).toBeNull();
    expect(report.error).toBe('redis offline');
  });
});
