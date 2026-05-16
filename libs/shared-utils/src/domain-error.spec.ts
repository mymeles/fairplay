import { DomainError } from './domain-error';

describe('DomainError', () => {
  it.each([
    ['VALIDATION_FAILED', 400],
    ['UNAUTHORIZED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['SESSION_EXPIRED', 410],
    ['RATE_LIMITED', 429],
    ['EXTERNAL_DEPENDENCY_FAILED', 502],
    ['INTERNAL_ERROR', 500],
    ['SPOTIFY_AUTH_FAILED', 401],
    ['SPOTIFY_PREMIUM_REQUIRED', 403],
    ['SPOTIFY_RATE_LIMITED', 429],
    ['SPOTIFY_NO_ACTIVE_DEVICE', 404],
    ['SPOTIFY_DEVICE_NOT_FOUND', 404],
  ] as const)('maps %s to HTTP %i', (code, status) => {
    const err = new DomainError(code, 'message');
    expect(err.code).toBe(code);
    expect(err.httpStatus).toBe(status);
    expect(err.message).toBe('message');
    expect(err).toBeInstanceOf(Error);
  });

  it('attaches details when provided', () => {
    const err = new DomainError('VALIDATION_FAILED', 'bad', { field: 'displayName' });
    expect(err.details).toEqual({ field: 'displayName' });
  });
});
