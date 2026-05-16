import type { ErrorResponseBody, ListResponse, SuccessResponse } from '@fairplay/shared-types';

export const wrapSuccess = <T>(data: T, requestId: string): SuccessResponse<T> => ({
  data,
  meta: { requestId },
});

export const wrapList = <T>(
  data: T[],
  requestId: string,
  extras: { count?: number; cursor?: string | null } = {},
): ListResponse<T> => ({
  data,
  meta: { requestId, ...extras },
});

export const wrapError = (
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): ErrorResponseBody => ({
  error: { code, message, requestId, ...(details ? { details } : {}) },
});
