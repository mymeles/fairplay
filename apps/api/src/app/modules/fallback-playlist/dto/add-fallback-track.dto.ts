import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class AddFallbackTrackDto {
  @IsString()
  @Matches(/^spotify:track:[A-Za-z0-9]+$/)
  spotifyUri!: string;

  @IsString()
  spotifyTrackId!: string;

  @IsString()
  title!: string;

  @IsString()
  artist!: string;

  @IsOptional()
  @IsString()
  album?: string;

  @IsInt()
  @Min(1_000)
  @Max(60 * 60 * 1000)
  durationMs!: number;

  @IsOptional()
  @IsString()
  artworkUrl?: string;

  @IsBoolean()
  explicit!: boolean;
}
