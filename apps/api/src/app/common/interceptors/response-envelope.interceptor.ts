import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { wrapSuccess } from '@fairplay/shared-utils';

const ALREADY_WRAPPED = Symbol('responseEnvelopeApplied');

interface MaybeWrapped {
  data?: unknown;
  meta?: { requestId?: unknown };
  [ALREADY_WRAPPED]?: boolean;
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = req.requestId ?? 'req_unknown';

    return next.handle().pipe(
      map((payload: unknown) => {
        // Skip wrapping if the controller already sent the response (e.g.
        // res.redirect for an OAuth handoff). Returning undefined keeps Nest
        // from re-serializing.
        if (res.headersSent) return undefined;
        if (payload && typeof payload === 'object') {
          const candidate = payload as MaybeWrapped;
          if (candidate[ALREADY_WRAPPED]) return candidate;
          if ('data' in candidate && 'meta' in candidate) return candidate;
        }
        return wrapSuccess(payload, requestId);
      }),
    );
  }
}
