import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { GuestService } from '../guests/guest.service';
import { HostAuthGuard } from '../spotify-auth/host-auth.guard';
import { CreateSessionDto } from './dto/create-session.dto';
import { JoinSessionDto } from './dto/join-session.dto';
import { JoinCodeService } from './join-code.service';
import { SessionService } from './session.service';

@Controller('sessions')
export class SessionController {
  constructor(
    private readonly sessions: SessionService,
    private readonly guests: GuestService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(HostAuthGuard)
  async create(@Req() req: Request, @Body() body: CreateSessionDto) {
    return this.sessions.createSession(req.hostClaims!.sub, {
      name: body.name,
      settingsOverride: body.settings,
      venue: body.venue,
      venueWifiHash: body.venueWifiHash,
    });
  }

  // Public lookup so the guest app can resolve a typed-in code into a
  // sessionId before posting to the join endpoint. Returns minimal info.
  @Get('by-code/:joinCode')
  async lookupByCode(@Param('joinCode') joinCode: string) {
    return this.sessions.getPublicByCode(JoinCodeService.normalize(joinCode));
  }

  @Get(':sessionId')
  @UseGuards(HostAuthGuard)
  async getOne(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.sessions.getSession(sessionId, req.hostClaims!.sub);
  }

  @Post(':sessionId/join')
  @HttpCode(HttpStatus.CREATED)
  async join(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: JoinSessionDto,
  ) {
    return this.guests.joinSession(sessionId, body);
  }

  @Post(':sessionId/end')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  async end(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.sessions.endSession(sessionId, req.hostClaims!.sub);
  }
}
