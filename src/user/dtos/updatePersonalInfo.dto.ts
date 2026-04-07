import {
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdatePersonalInfoDTO {
  @IsOptional()
  @IsString()
  @MinLength(3)
  userName: string;

  @IsOptional()
  @IsPhoneNumber(undefined, {
    message: JSON.stringify({
      en: 'Invalid phone number',
      ar: 'رقم الجوال غير صحيح',
    }),
  })
  phone: string;
}
