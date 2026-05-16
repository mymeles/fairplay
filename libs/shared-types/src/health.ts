export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthReport {
  status: HealthStatus;
  service: string;
  uptimeSeconds: number;
  version: string;
  checkedAt: string;
}

export interface DependencyHealthReport {
  status: HealthStatus;
  dependency: 'postgres' | 'redis';
  latencyMs: number | null;
  checkedAt: string;
  error?: string;
}
