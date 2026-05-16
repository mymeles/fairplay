export type DomainErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SESSION_EXPIRED'
  | 'RATE_LIMITED'
  | 'EXTERNAL_DEPENDENCY_FAILED'
  | 'INTERNAL_ERROR'
  | 'SPOTIFY_AUTH_FAILED'
  | 'SPOTIFY_PREMIUM_REQUIRED'
  | 'SPOTIFY_RATE_LIMITED'
  | 'SPOTIFY_NO_ACTIVE_DEVICE'
  | 'SPOTIFY_DEVICE_NOT_FOUND';

const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  SESSION_EXPIRED: 410,
  RATE_LIMITED: 429,
  EXTERNAL_DEPENDENCY_FAILED: 502,
  INTERNAL_ERROR: 500,
  SPOTIFY_AUTH_FAILED: 401,
  SPOTIFY_PREMIUM_REQUIRED: 403,
  SPOTIFY_RATE_LIMITED: 429,
  SPOTIFY_NO_ACTIVE_DEVICE: 404,
  SPOTIFY_DEVICE_NOT_FOUND: 404,
};

export class DomainError extends Error {
  public readonly code: DomainErrorCode;
  public readonly httpStatus: number;
  public readonly details: Record<string, unknown>;

  constructor(code: DomainErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.httpStatus = STATUS_BY_CODE[code];
    this.details = details;
  }
}
