import { wrapError, wrapList, wrapSuccess } from './response-envelope';

describe('response envelopes', () => {
  it('wraps a success payload with requestId metadata', () => {
    expect(wrapSuccess({ foo: 1 }, 'req_abc')).toEqual({
      data: { foo: 1 },
      meta: { requestId: 'req_abc' },
    });
  });

  it('wraps a list response with count and cursor when provided', () => {
    expect(wrapList([1, 2, 3], 'req_abc', { count: 3, cursor: 'next' })).toEqual({
      data: [1, 2, 3],
      meta: { requestId: 'req_abc', count: 3, cursor: 'next' },
    });
  });

  it('wraps an error with optional details', () => {
    expect(wrapError('NOT_FOUND', 'missing', 'req_abc', { id: 'x' })).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'missing',
        requestId: 'req_abc',
        details: { id: 'x' },
      },
    });
  });

  it('omits details when not provided', () => {
    expect(wrapError('INTERNAL_ERROR', 'oops', 'req_abc')).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'oops', requestId: 'req_abc' },
    });
  });
});
