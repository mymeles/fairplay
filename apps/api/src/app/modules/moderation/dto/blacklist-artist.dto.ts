import { IsString, MaxLength, MinLength } from 'class-validator';

export class BlacklistArtistDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  artistName!: string;
}
