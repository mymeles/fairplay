import { IsString, Length, Matches } from 'class-validator';

export class SelectDeviceDto {
  // Spotify device IDs are opaque strings — typically 40+ alphanumeric chars.
  // Bound the length and reject obvious junk so we don't burn a Spotify call.
  @IsString()
  @Length(8, 256)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'deviceId must be alphanumeric.' })
  deviceId!: string;
}
