import { IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class LoginQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @IsUrl({ require_tld: false, require_protocol: true })
  redirectTo?: string;

  // Allows GET /login?json=1 to return JSON instead of 302. Listed here so the
  // global ValidationPipe (forbidNonWhitelisted: true) doesn't reject it.
  @IsOptional()
  @IsIn(['1'])
  json?: string;
}
