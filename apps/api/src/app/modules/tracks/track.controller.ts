import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { DomainError } from '@fairplay/shared-utils';
import { GuestAuthGuard } from '../guests/guest-auth.guard';
import { HostAuthGuard } from '../spotify-auth/host-auth.guard';
import { NormalizeSpotifyTrackDto } from './dto/normalize-spotify-track.dto';
import { TrackSearchQueryDto } from './dto/track-search-query.dto';
import { TrackSearchService } from './track-search.service';

@Controller()
export class TrackController {
  constructor(private readonly tracks: TrackSearchService) {}

  @Get('sessions/:sessionId/search')
  @UseGuards(GuestAuthGuard)
  async search(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Query() query: TrackSearchQueryDto,
  ) {
    const guest = this.requireGuestForSession(req, sessionId);
    return this.tracks.search(sessionId, guest.sub, query.q);
  }

  @Get('sessions/:sessionId/host/search')
  @UseGuards(HostAuthGuard)
  async hostSearch(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Query() query: TrackSearchQueryDto,
  ) {
    return this.tracks.searchForHost(sessionId, req.hostClaims!.sub, query.q);
  }

  @Post('tracks/normalize')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GuestAuthGuard)
  async normalize(@Req() req: Request, @Body() body: NormalizeSpotifyTrackDto) {
    const guest = req.guestClaims!;
    return this.tracks.normalizeTrack(guest.sid, guest.sub, body);
  }

  private requireGuestForSession(req: Request, sessionId: string) {
    const guest = req.guestClaims!;
    if (guest.sid !== sessionId) {
      throw new DomainError('FORBIDDEN', 'Guest token is scoped to a different session.');
    }
    return guest;
  }
}
