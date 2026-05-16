import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { HostAuthGuard } from './host-auth.guard';
import { LoginQueryDto } from './dto/login.dto';
import { SpotifyAuthService } from './spotify-auth.service';

@Controller('auth/spotify')
export class SpotifyAuthController {
  constructor(private readonly auth: SpotifyAuthService) {}

  // Public — anyone hitting this is starting an OAuth flow.
  // When the client wants the raw URL (e.g., a server-rendered page),
  // hit GET /api/v1/auth/spotify/login?json=1; otherwise we 302.
  @Get('login')
  async login(
    @Query() query: LoginQueryDto,
    @Query('json') json: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.buildLoginRedirect(query.redirectTo);

    if (json === '1') {
      return {
        authorizeUrl: result.authorizeUrl,
        state: result.state,
        expiresAt: result.expiresAt.toISOString(),
      };
    }

    res.redirect(HttpStatus.FOUND, result.authorizeUrl);
    return null;
  }

  @Get('status')
  @UseGuards(HostAuthGuard)
  async status(@Req() req: Request) {
    const host = req.hostClaims!;
    return this.auth.getHostStatus(host.sub);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  async logout(@Req() req: Request) {
    const host = req.hostClaims!;
    const removed = await this.auth.logout(host.sub);
    return { removed };
  }
}
