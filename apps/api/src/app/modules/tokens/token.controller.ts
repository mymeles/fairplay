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
import { GuestAuthGuard } from '../guests/guest-auth.guard';
import { HostAuthGuard } from '../spotify-auth/host-auth.guard';
import { BoostService } from './boost.service';
import { GrantTokensDto } from './dto/grant-tokens.dto';
import { GuestWalletService } from './guest-wallet.service';

@Controller('guests/me/wallet')
@UseGuards(GuestAuthGuard)
export class GuestWalletController {
  constructor(private readonly wallets: GuestWalletService) {}

  @Get()
  async get(@Req() req: Request) {
    const guest = req.guestClaims!;
    return this.wallets.getWallet(guest.sub, guest.sid);
  }
}

@Controller('queue/:entryId')
@UseGuards(GuestAuthGuard)
export class QueueBoostController {
  constructor(private readonly boosts: BoostService) {}

  @Post('apply-boost')
  @HttpCode(HttpStatus.OK)
  async applyBoost(
    @Req() req: Request,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
  ) {
    const guest = req.guestClaims!;
    return this.boosts.applyBoost(entryId, guest.sub, guest.sid);
  }
}

@Controller('sessions/:sessionId/guests/:guestId')
@UseGuards(HostAuthGuard)
export class HostTokenGrantController {
  constructor(private readonly wallets: GuestWalletService) {}

  @Post('grant-tokens')
  @HttpCode(HttpStatus.OK)
  async grant(
    @Req() req: Request,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('guestId', new ParseUUIDPipe()) guestId: string,
    @Body() body: GrantTokensDto,
  ) {
    return this.wallets.grantTokens(sessionId, guestId, req.hostClaims!.sub, body);
  }
}
