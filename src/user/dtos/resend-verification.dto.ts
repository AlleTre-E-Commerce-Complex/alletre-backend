import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationDTO {
  @IsNotEmpty()
  @IsEmail()
  email: string;
}
