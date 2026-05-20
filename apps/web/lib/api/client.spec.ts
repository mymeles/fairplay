/**
 * Unit tests for the API client. The point of the client is to:
 *  - prepend the right base URL
 *  - attach the right bearer based on `auth` + `sessionId`
 *  - unwrap the `{ data, meta }` success envelope
 *  - turn `{ error: { code, message, ... } }` 4xx/5xx responses into ApiError
 *
 * We use a fetch stub so the tests stay in-process — no network, no MSW.
 */

import { ApiError, apiFetch, API_BASE_URL } from './client';
import { guestTokenStore, hostTokenStore } from '@/lib/auth/token-store';

type FetchInit = RequestInit & { method?: string };
interface MockResponse {
  status?: number;
  body?: unknown;
  text?: string;
}

const installFetch = (resp: MockResponse | ((url: string, init: FetchInit) => MockResponse)) => {
  const calls: Array<{ url: string; init: FetchInit }> = [];
  globalThis.fetch = jest.fn(async (input: RequestInfo, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.toString();
    const initObj = init as FetchInit;
    calls.push({ url, init: initObj });
    const out = typeof resp === 'function' ? resp(url, initObj) : resp;
    const body = out.text ?? (out.body == null ? '' : JSON.stringify(out.body));
    return {
      ok: (out.status ?? 200) < 400,
      status: out.status ?? 200,
      text: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return calls;
};

afterEach(() => {
  jest.restoreAllMocks();
  hostTokenStore.clear();
  for (const sid of guestTokenStore.listSessions()) guestTokenStore.clear(sid);
});

describe('apiFetch', () => {
  it('unwraps the success envelope', async () => {
    installFetch({ body: { data: { ok: true }, meta: { requestId: 'req_1' } } });

    const result = await apiFetch<{ ok: boolean }>({ path: '/health' });

    expect(result).toEqual({ ok: true });
  });

  it('builds the URL with query parameters', async () => {
    const calls = installFetch({ body: { data: [], meta: { requestId: 'req_2' } } });

    await apiFetch({ path: '/sessions/123/search', query: { q: 'levitating' } });

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/sessions/123/search?q=levitating`);
  });

  it('attaches the host bearer when auth=host', async () => {
    hostTokenStore.write('host-jwt-123', 'host-user-1');
    const calls = installFetch({ body: { data: { connected: true }, meta: { requestId: 'r' } } });

    await apiFetch({ path: '/auth/spotify/status', auth: 'host' });

    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer host-jwt-123',
    );
  });

  it('rejects host requests before fetch when the host bearer is missing', async () => {
    const calls = installFetch({ body: { data: { connected: true }, meta: { requestId: 'r' } } });

    await expect(apiFetch({ path: '/sessions', method: 'POST', auth: 'host' })).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      message: 'Connect Spotify to continue.',
      status: 401,
    });
    expect(calls).toHaveLength(0);
  });

  it('attaches the guest bearer keyed by sessionId', async () => {
    guestTokenStore.write('sess-A', 'guest-jwt-A', {
      guestId: 'g-A',
      sessionId: 'sess-A',
      displayName: 'A',
    });
    guestTokenStore.write('sess-B', 'guest-jwt-B', {
      guestId: 'g-B',
      sessionId: 'sess-B',
      displayName: 'B',
    });
    const calls = installFetch({ body: { data: [], meta: { requestId: 'r' } } });

    await apiFetch({ path: '/sessions/sess-B/queue', auth: 'guest', sessionId: 'sess-B' });

    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer guest-jwt-B',
    );
  });

  it('rejects guest requests before fetch when the guest bearer is missing', async () => {
    const calls = installFetch({ body: { data: [], meta: { requestId: 'r' } } });

    await expect(
      apiFetch({ path: '/sessions/sess-B/queue', auth: 'guest', sessionId: 'sess-B' }),
    ).rejects.toMatchObject({
      code: 'GUEST_AUTH_REQUIRED',
      message: 'Join this session before continuing.',
      status: 401,
    });
    expect(calls).toHaveLength(0);
  });

  it('throws ApiError mapping code/message from the error envelope', async () => {
    installFetch({
      status: 429,
      body: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many adds, slow down.',
          requestId: 'req_x',
          details: { retryAfterMs: 1500 },
        },
      },
    });

    await expect(
      apiFetch({ path: '/sessions/abc/queue', method: 'POST', body: {} }),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Too many adds, slow down.',
      status: 429,
      details: { retryAfterMs: 1500 },
      requestId: 'req_x',
    });
  });

  it('falls back to a generic ApiError when the response is not enveloped', async () => {
    installFetch({ status: 500, text: 'boom' });

    const promise = apiFetch({ path: '/health' });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 500 });
  });

  it('returns undefined for a 204 response', async () => {
    installFetch({ status: 204, body: null });

    const result = await apiFetch({ path: '/whatever' });

    expect(result).toBeUndefined();
  });

  it('turns request timeouts into ApiError', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn(
      (_input: RequestInfo, init: RequestInit = {}) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    ) as unknown as typeof fetch;

    const promise = apiFetch({ path: '/slow', timeoutMs: 1000 });
    jest.advanceTimersByTime(1000);

    await expect(promise).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
      message: 'Request timed out after 1s.',
      status: 0,
      details: { timeoutMs: 1000 },
    });
    jest.useRealTimers();
  });
});
