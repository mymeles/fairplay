import {
  Body,
  Controller,
  Delete,
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
import { BlacklistService } from './blacklist.service';
import { BlacklistArtistDto } from './dto/blacklist-artist.dto';
import { BlacklistTrackDto } from './dto/blacklist-track.dto';
import { GuestDisciplineService } from './guest-discipline.service';

@Controller('sessions/:sessionId')
@UseGuards(HostAuthGuard)
export class ModerationController {
  constructor(
    private readonly blacklists: BlacklistService,
    private readonly discipline: GuestDisciplineService,
  ) {}

  @Post('blacklist/track')
  @HttpCode(HttpStatus.OK)
  async blacklistTrack(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: BlacklistTrackDto,
  ) {
    return this.blacklists.blacklistTrack(sessionId, req.hostClaims!.sub, body);
  }

  @Post('blacklist/artist')
  @HttpCode(HttpStatus.OK)
  async blacklistArtist(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: BlacklistArtistDto,
  ) {
    return this.blacklists.blacklistArtist(sessionId, req.hostClaims!.sub, body);
  }

  @Post('guests/:guestId/mute')
  @HttpCode(HttpStatus.OK)
  async muteGuest(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('guestId', new ParseUUIDPipe()) guestId: string,
  ) {
    return this.discipline.muteGuest(sessionId, guestId, req.hostClaims!.sub);
  }

  @Post('guests/:guestId/ban')
  @HttpCode(HttpStatus.OK)
  async banGuest(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('guestId', new ParseUUIDPipe()) guestId: string,
  ) {
    return this.discipline.banGuest(sessionId, guestId, req.hostClaims!.sub);
  }

  @Delete('guests/:guestId/mute')
  @HttpCode(HttpStatus.OK)
  async unmuteGuest(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('guestId', new ParseUUIDPipe()) guestId: string,
  ) {
    return this.discipline.unmuteGuest(sessionId, guestId, req.hostClaims!.sub);
  }
}
