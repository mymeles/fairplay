import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// Mirrors NormalizeSpotifyTrackDto. The guest app sends back the same
// Spotify-search payload it received, and the server re-normalizes server-side
// so we never trust unverified shape coming from a client.

class SpotifyArtistInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

class SpotifyAlbumImageInputDto {
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  url!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  height?: number;
}

class SpotifyAlbumInputDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  name?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpotifyAlbumImageInputDto)
  images?: SpotifyAlbumImageInputDto[];
}

export class AddQueueEntryDto {
  @IsString()
  @Matches(/^[A-Za-z0-9]+$/)
  id!: string;

  @IsString()
  @Matches(/^spotify:track:[A-Za-z0-9]+$/)
  uri!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SpotifyArtistInputDto)
  artists!: SpotifyArtistInputDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SpotifyAlbumInputDto)
  album?: SpotifyAlbumInputDto;

  @IsInt()
  @Min(1)
  @Max(60 * 60 * 1000)
  duration_ms!: number;

  @IsBoolean()
  explicit!: boolean;

  @IsOptional()
  @IsBoolean()
  is_local?: boolean;
}
