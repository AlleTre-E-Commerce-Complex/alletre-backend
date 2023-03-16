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
  @IsPhoneNumber()
  phone: string;
}
