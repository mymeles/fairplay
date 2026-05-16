import { Type } from 'class-transformer';
import {
  IsAlphanumeric,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class GuestLocationDto {
  @IsNumber() @Min(-90) @Max(90) lat!: number;
  @IsNumber() @Min(-180) @Max(180) lng!: number;
  // Mobile GPS accuracy is rarely worse than 1 km even indoors; cap at
  // 5 km to reject obviously-bogus device-reported values.
  @IsNumber() @Min(0) @Max(5_000) accuracyMeters!: number;
}

export class JoinSessionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  displayName!: string;

  // Either joinCode or qrToken must be present — enforced by the service so
  // the validation message is explicit rather than a generic schema fail.
  @IsOptional()
  @IsAlphanumeric()
  @Length(4, 16)
  joinCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'qrToken must be url-safe base64' })
  @Length(8, 256)
  qrToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceHash?: string;

  // Guest's coarse GPS, used by the M05 proximity gate. Optional — sessions
  // with `proximityRequired=false` (the default) ignore omission.
  @IsOptional()
  @ValidateNested()
  @Type(() => GuestLocationDto)
  location?: GuestLocationDto;

  // Opaque hex digest of the guest's current Wi-Fi fingerprint.
  @IsOptional()
  @IsString()
  @Length(32, 128)
  @Matches(/^[A-Fa-f0-9]+$/, { message: 'wifiHash must be a hex digest' })
  wifiHash?: string;
}
