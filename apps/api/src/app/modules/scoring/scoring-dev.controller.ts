import {
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { ScoreRebuildService } from './score-rebuild.service';

// Optional admin/dev tool from the M09 doc. Lives under /dev so anyone with
// access to a non-prod environment can manually recompute and observe the
// difference between Postgres scores and the ZSET projection.
//
// Authorization is intentionally a hard refuse in production — this endpoint
// is *not* protected by any guard, so leaking it would let anyone trigger
// expensive recalculations. The host-driven recalculate flow ships in M14.
@Controller('dev/sessions/:sessionId')
export class ScoringDevController {
  private readonly logger = new Logger(ScoringDevController.name);

  constructor(
    private readonly rebuild: ScoreRebuildService,
    private readonly config: AppConfigService,
  ) {}

  @Post('recalculate-scores')
  @HttpCode(HttpStatus.ACCEPTED)
  async recalculateScores(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    if (this.config.isProduction) {
      throw new ForbiddenException('Dev tools are disabled in production.');
    }
    this.logger.warn({ sessionId }, 'Manual recalculate-scores triggered.');
    return this.rebuild.recalculateSession(sessionId);
  }
}
