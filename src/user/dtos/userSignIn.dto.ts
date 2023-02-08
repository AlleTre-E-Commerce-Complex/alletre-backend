import { IsEmail, IsNotEmpty, IsString, Length } from '@nestjs/class-validator';

export class UserSignInDTO {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @Length(8, 255)
  password: string;
}
