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
import { DomainError } from '@fairplay/shared-utils';
import { GuestAuthGuard } from '../guests/guest-auth.guard';
import { AddQueueEntryDto } from './dto/add-queue-entry.dto';
import { QueueService } from './queue.service';

@Controller()
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  @Post('sessions/:sessionId/queue')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(GuestAuthGuard)
  async add(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: AddQueueEntryDto,
  ) {
    const guest = this.requireGuestForSession(req, sessionId);
    return this.queue.addTrack(sessionId, guest.sub, body);
  }

  @Get('sessions/:sessionId/queue')
  @UseGuards(GuestAuthGuard)
  async list(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    const guest = this.requireGuestForSession(req, sessionId);
    return this.queue.listSession(sessionId, guest.sub);
  }

  @Delete('queue/:entryId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GuestAuthGuard)
  async remove(
    @Req() req: Request,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
  ) {
    const guest = req.guestClaims!;
    return this.queue.removeOwnEntry(entryId, guest.sub);
  }

  private requireGuestForSession(req: Request, sessionId: string) {
    const guest = req.guestClaims!;
    if (guest.sid !== sessionId) {
      throw new DomainError('FORBIDDEN', 'Guest token is scoped to a different session.');
    }
    return guest;
  }
}
