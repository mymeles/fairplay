import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class BlacklistTrackDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]+$/)
  spotifyTrackId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^spotify:track:[A-Za-z0-9]+$/)
  spotifyUri?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;
}
