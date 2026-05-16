import type { RequestId } from './ids';

export interface ResponseMeta {
  requestId: RequestId;
  count?: number;
  cursor?: string | null;
}

export interface SuccessResponse<T> {
  data: T;
  meta: ResponseMeta;
}

export interface ListResponse<T> {
  data: T[];
  meta: ResponseMeta;
}

export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    requestId: RequestId;
    details?: Record<string, unknown>;
  };
}
