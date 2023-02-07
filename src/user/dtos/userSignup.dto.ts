import {
  IsEmail,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  Length,
} from '@nestjs/class-validator';

export class UserSignUpDTO {
  @IsNotEmpty()
  @IsString()
  userName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @Length(8, 255)
  password: string;

  @IsNotEmpty()
  @IsPhoneNumber()
  phone: string;
}
