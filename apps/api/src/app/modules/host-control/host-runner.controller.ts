import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { HostAuthGuard } from '../spotify-auth/host-auth.guard';
import { UpdateSessionSettingsDto } from './dto/update-session-settings.dto';
import { HostControlService } from './host-control.service';
import { SessionSettingsService } from './session-settings.service';

// M14 — session-scoped host controls. Two paths share a controller because
// they all live under `sessions/:sessionId/...`:
//   POST   /sessions/:id/runner/start
//   POST   /sessions/:id/runner/stop
//   PATCH  /sessions/:id/settings
@Controller('sessions/:sessionId')
@UseGuards(HostAuthGuard)
export class HostRunnerController {
  constructor(
    private readonly hostControl: HostControlService,
    private readonly settings: SessionSettingsService,
  ) {}

  @Post('runner/start')
  @HttpCode(HttpStatus.OK)
  async startRunner(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.hostControl.startRunner(sessionId, req.hostClaims!.sub);
  }

  @Post('runner/stop')
  @HttpCode(HttpStatus.OK)
  async stopRunner(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.hostControl.stopRunner(sessionId, req.hostClaims!.sub);
  }

  @Patch('settings')
  @HttpCode(HttpStatus.OK)
  async patchSettings(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: UpdateSessionSettingsDto,
  ) {
    return this.settings.updateSettings(sessionId, req.hostClaims!.sub, body);
  }
}
