import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { HostAuthGuard } from '../spotify-auth/host-auth.guard';
import { HostControlService } from './host-control.service';

// M14 — pin/unpin live under `queue/:entryId` to match the existing veto +
// challenge-lock paths. Each endpoint authenticates as host and ownership
// is verified via the session that owns the entry.
@Controller('queue/:entryId')
@UseGuards(HostAuthGuard)
export class HostQueueController {
  constructor(private readonly hostControl: HostControlService) {}

  @Post('pin')
  @HttpCode(HttpStatus.OK)
  async pin(@Req() req: Request, @Param('entryId', new ParseUUIDPipe()) entryId: string) {
    return this.hostControl.pinEntry(entryId, req.hostClaims!.sub);
  }

  @Post('unpin')
  @HttpCode(HttpStatus.OK)
  async unpin(@Req() req: Request, @Param('entryId', new ParseUUIDPipe()) entryId: string) {
    return this.hostControl.unpinEntry(entryId, req.hostClaims!.sub);
  }
}
