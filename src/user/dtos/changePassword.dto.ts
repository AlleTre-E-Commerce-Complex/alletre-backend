import { IsOptional, IsString, MinLength } from 'class-validator';

export class ChangePasswordDTO {
  @IsOptional()
  @IsString()
  @MinLength(8)
  oldPassword: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword: string;
}
