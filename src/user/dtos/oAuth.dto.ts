import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
} from '@nestjs/class-validator';

export class OAuthDto {
  @IsNotEmpty()
  @IsString()
  idToken: string;

  @IsOptional()
  @IsPhoneNumber()
  phone: string;

  @IsOptional()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  userName: string;
}
