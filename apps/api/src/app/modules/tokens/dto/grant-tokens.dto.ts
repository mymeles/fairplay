import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GrantTokensDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  boostTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  challengeTokens?: number;
}
