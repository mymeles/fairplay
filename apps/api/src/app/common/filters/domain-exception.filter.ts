import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError, wrapError } from '@fairplay/shared-utils';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = req.requestId ?? 'req_unknown';

    // The response was already sent (e.g. a controller called res.redirect
    // and Nest later tried to serialize the return value). Logging only — a
    // second res.json would throw "Cannot set headers after they are sent."
    if (res.headersSent) {
      this.logger.warn({ requestId }, 'Suppressed exception after response was sent.');
      return;
    }

    if (exception instanceof DomainError) {
      this.logger.warn(
        { code: exception.code, requestId, details: exception.details },
        `Domain error: ${exception.message}`,
      );
      res
        .status(exception.httpStatus)
        .json(wrapError(exception.code, exception.message, requestId, exception.details));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ?? exception.message);
      const details =
        typeof response === 'object' && response !== null
          ? (response as Record<string, unknown>)
          : undefined;
      const flatMessage = Array.isArray(message) ? message.join('; ') : message;
      const code = status === 400 ? 'VALIDATION_FAILED' : 'HTTP_ERROR';
      this.logger.warn({ status, requestId, details }, `HTTP error: ${flatMessage}`);
      res.status(status).json(wrapError(code, flatMessage, requestId, details));
      return;
    }

    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error({ err, requestId }, 'Unhandled exception');
    res
      .status(500)
      .json(wrapError('INTERNAL_ERROR', 'Unexpected server error.', requestId));
  }
}
