import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
} from '@nestjs/class-validator';
import { OAuthType } from '@prisma/client';
import { IsIn } from 'class-validator';

export class OAuthDto {
  @IsNotEmpty()
  @IsString()
  idToken: string;

  @IsOptional()
  @IsPhoneNumber(undefined, {
    message: JSON.stringify({
      en: 'Invalid phone number',
      ar: 'رقم الجوال غير صحيح',
    }),
  })
  phone: string;

  @IsOptional()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  userName: string;

  @IsNotEmpty()
  @IsIn(Object.keys(OAuthType))
  oAuthType: OAuthType;
}
