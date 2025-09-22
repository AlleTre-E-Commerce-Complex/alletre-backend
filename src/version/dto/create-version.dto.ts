// src/version/create-version.dto.ts
import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateAppVersionDto {
  @IsString() platform!: 'ios' | 'android';
  @IsString() version!: string; // semver
  @IsOptional() @IsBoolean() isLatest?: boolean;
  @IsOptional() @IsBoolean() isMinSupported?: boolean;
  @IsOptional() @IsString() releaseNotes?: string;
  @IsOptional() @IsString() downloadUrl?: string;
}

