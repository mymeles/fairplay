import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { REQUEST_ID_HEADER, generateRequestId } from '@fairplay/shared-utils';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: true,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            '*.access_token',
            '*.refresh_token',
            '*.password',
          ],
          remove: true,
        },
        genReqId: (req, res) => {
          const incoming = req.headers[REQUEST_ID_HEADER];
          const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : generateRequestId();
          res.setHeader(REQUEST_ID_HEADER, id);
          return id;
        },
        customProps: (req) => ({ requestId: (req as { id?: string }).id }),
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:standard' } },
      },
    }),
  ],
})
export class ObservabilityModule {}
