import { guestTokenStore, hostTokenStore } from '@/lib/auth/token-store';
import type { ErrorResponseBody, SuccessResponse } from '@fairplay/shared-types';

export type AuthRole = 'host' | 'guest' | 'public';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiRequest {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: AuthRole;
  sessionId?: string;
  signal?: AbortSignal;
}

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

const buildQuery = (query?: ApiRequest['query']): string => {
  if (!query) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
};

const pickToken = (auth: AuthRole, sessionId?: string): string | null => {
  if (auth === 'host') return hostTokenStore.read();
  if (auth === 'guest' && sessionId) return guestTokenStore.read(sessionId);
  return null;
};

export const apiFetch = async <T>(req: ApiRequest): Promise<T> => {
  const auth: AuthRole = req.auth ?? 'public';
  const token = pickToken(auth, req.sessionId);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (req.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `${API_BASE_URL}${req.path}${buildQuery(req.query)}`;

  const res = await fetch(url, {
    method: req.method ?? 'GET',
    headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
    signal: req.signal,
    cache: 'no-store',
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  // Defensive parse: some intermediaries can return non-JSON bodies (HTML
  // 502s, plain-text health errors). We never want a SyntaxError leaking
  // out as the error the UI sees — fall through to an ApiError instead.
  let payload: unknown = null;
  if (text.length) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const errBody = payload as ErrorResponseBody | null;
    const code = errBody?.error?.code ?? 'HTTP_ERROR';
    const message = errBody?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiError(
      code,
      message,
      res.status,
      errBody?.error?.details,
      errBody?.error?.requestId,
    );
  }

  const success = payload as SuccessResponse<T> | null;
  if (success && typeof success === 'object' && 'data' in success) {
    return success.data as T;
  }
  return payload as T;
};
