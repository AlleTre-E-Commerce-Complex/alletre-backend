import { IsEmail } from 'class-validator';

export class SubscribeDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;
}
