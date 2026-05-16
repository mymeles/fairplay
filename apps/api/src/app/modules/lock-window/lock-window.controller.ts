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
import { GuestAuthGuard } from '../guests/guest-auth.guard';
import { HostAuthGuard } from '../spotify-auth/host-auth.guard';
import { ChallengeService } from './challenge.service';
import { LockWindowService } from './lock-window.service';

@Controller('queue/:entryId')
export class LockWindowController {
  constructor(
    private readonly challenges: ChallengeService,
    private readonly locks: LockWindowService,
  ) {}

  @Post('challenge-lock')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GuestAuthGuard)
  async challenge(@Req() req: Request, @Param('entryId', new ParseUUIDPipe()) entryId: string) {
    const guest = req.guestClaims!;
    return this.challenges.challengeLock(entryId, guest.sub, guest.sid);
  }

  @Post('veto')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  async veto(@Req() req: Request, @Param('entryId', new ParseUUIDPipe()) entryId: string) {
    return this.locks.vetoEntry(entryId, req.hostClaims!.sub);
  }
}
