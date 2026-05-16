import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { HostAuthGuard } from '../spotify-auth/host-auth.guard';
import { SelectDeviceDto } from './dto/select-device.dto';
import { SpotifyDeviceService } from './spotify-device.service';

@Controller('host/spotify')
@UseGuards(HostAuthGuard)
export class HostDeviceController {
  constructor(private readonly devices: SpotifyDeviceService) {}

  @Get('devices')
  async listDevices(@Req() req: Request) {
    return this.devices.listDevices(req.hostClaims!.sub);
  }

  @Get('playback-state')
  async getPlaybackState(@Req() req: Request) {
    return this.devices.getPlaybackState(req.hostClaims!.sub);
  }

  @Post('device/select')
  @HttpCode(HttpStatus.OK)
  async selectDevice(@Req() req: Request, @Body() body: SelectDeviceDto) {
    return this.devices.selectDevice(req.hostClaims!.sub, body.deviceId);
  }
}
