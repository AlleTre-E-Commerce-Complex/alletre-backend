import { IsNotEmpty, IsString, Length } from 'class-validator';

export class ResetCredentialsDTO {
  @IsNotEmpty()
  @IsString()
  token: string;

  @IsNotEmpty()
  @IsString()
  @Length(8, 255)
  newPassword: string;
}
