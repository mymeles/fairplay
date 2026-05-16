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
import { GuestAuthGuard } from '../guests/guest-auth.guard';
import { CastVoteDto } from './dto/cast-vote.dto';
import { VoteService } from './vote.service';

@Controller('queue/:entryId/vote')
@UseGuards(GuestAuthGuard)
export class VoteController {
  constructor(private readonly votes: VoteService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async cast(
    @Req() req: Request,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: CastVoteDto,
  ) {
    const guest = req.guestClaims!;
    return this.votes.castVote(entryId, guest.sub, guest.sid, body.value);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async remove(
    @Req() req: Request,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
  ) {
    const guest = req.guestClaims!;
    return this.votes.removeVote(entryId, guest.sub, guest.sid);
  }
}
