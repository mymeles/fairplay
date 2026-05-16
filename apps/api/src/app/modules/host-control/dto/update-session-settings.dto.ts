import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// Partial settings — every field is optional. The service merges the supplied
// keys onto the current session.settings and persists the full object.
// Bounds match the existing DEFAULT_SESSION_SETTINGS shape; intentionally
// generous so a host can tune aggressively without bypassing validation.

class ScoringWeightsPatchDto {
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  upvoteWeight?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  downvoteWeight?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  boostWeight?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(10)
  ageWeight?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100_000)
  hostPinWeight?: number;
}

export class UpdateSessionSettingsDto {
  @IsOptional() @IsInt() @Min(1) @Max(10)
  lockSize?: number;

  @IsOptional() @IsInt() @Min(5) @Max(600)
  lockDurationSeconds?: number;

  @IsOptional() @IsInt() @Min(1) @Max(5)
  spotifyQueueDepthTarget?: number;

  @IsOptional() @IsInt() @Min(0) @Max(50)
  initialBoostTokens?: number;

  @IsOptional() @IsInt() @Min(0) @Max(20)
  initialChallengeTokens?: number;

  @IsOptional() @IsBoolean()
  allowExplicitTracks?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(86_400)
  duplicateCooldownSeconds?: number;

  @IsOptional() @IsInt() @Min(1) @Max(100)
  maxSuggestionsPerGuest?: number;

  @IsOptional() @IsBoolean()
  proximityRequired?: boolean;

  @IsOptional() @ValidateNested() @Type(() => ScoringWeightsPatchDto)
  scoring?: ScoringWeightsPatchDto;
}
