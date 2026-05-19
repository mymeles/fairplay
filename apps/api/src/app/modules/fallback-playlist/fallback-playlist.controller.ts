import {
  Body,
  Controller,
  Delete,
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
import { HostAuthGuard } from '../spotify-auth/host-auth.guard';
import { AddFallbackTrackDto } from './dto/add-fallback-track.dto';
import { FallbackPlaylistService } from './fallback-playlist.service';

@Controller('sessions/:sessionId/fallback-tracks')
@UseGuards(HostAuthGuard)
export class FallbackPlaylistController {
  constructor(private readonly fallback: FallbackPlaylistService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.fallback.list(sessionId, req.hostClaims!.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: AddFallbackTrackDto,
  ) {
    return this.fallback.add(sessionId, req.hostClaims!.sub, body);
  }

  @Delete(':fallbackTrackId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('fallbackTrackId', new ParseUUIDPipe()) fallbackTrackId: string,
  ) {
    await this.fallback.remove(sessionId, req.hostClaims!.sub, fallbackTrackId);
  }
}
