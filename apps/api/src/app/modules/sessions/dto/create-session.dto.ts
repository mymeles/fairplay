import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// Bounds picked to match the milestone defaults — `lockSize` of 0 would break
// the lock-window logic we'll add in M10, so the lower bound here matters.
class SessionSettingsOverrideDto {
  @IsOptional() @IsInt() @Min(1) @Max(10) lockSize?: number;
  @IsOptional() @IsInt() @Min(15) @Max(600) lockDurationSeconds?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) spotifyQueueDepthTarget?: number;
  @IsOptional() @IsInt() @Min(0) @Max(50) initialBoostTokens?: number;
  @IsOptional() @IsInt() @Min(0) @Max(50) initialChallengeTokens?: number;
  @IsOptional() @IsBoolean() allowExplicitTracks?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(86_400) duplicateCooldownSeconds?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) maxSuggestionsPerGuest?: number;
  @IsOptional() @IsBoolean() proximityRequired?: boolean;
}

class VenueDto {
  @IsNumber() @Min(-90) @Max(90) lat!: number;
  @IsNumber() @Min(-180) @Max(180) lng!: number;
  // 5 m floor avoids treating GPS noise as a valid radius; 5 km ceiling
  // keeps anyone from accidentally setting "radius = a city block".
  @IsInt() @Min(5) @Max(5_000) radiusMeters!: number;
}

export class CreateSessionDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SessionSettingsOverrideDto)
  settings?: SessionSettingsOverrideDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => VenueDto)
  venue?: VenueDto;

  // Opaque hex digest from the host's network fingerprint (sha256-shaped).
  // The server never sees the underlying SSID/BSSID.
  @IsOptional()
  @IsString()
  @Length(32, 128)
  @Matches(/^[A-Fa-f0-9]+$/, { message: 'venueWifiHash must be a hex digest' })
  venueWifiHash?: string;
}
