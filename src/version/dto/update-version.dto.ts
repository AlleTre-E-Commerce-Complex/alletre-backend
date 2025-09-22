// src/version/update-version.dto.ts
import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class UpdateAppVersionDto {
  @IsOptional() @IsString() version?: string;
  @IsOptional() @IsBoolean() isLatest?: boolean;
  @IsOptional() @IsBoolean() isMinSupported?: boolean;
  @IsOptional() @IsString() releaseNotes?: string;
  @IsOptional() @IsString() downloadUrl?: string;
}
