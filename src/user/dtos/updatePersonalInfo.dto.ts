import { IsNotEmpty, IsString } from 'class-validator';

export class UpdatePersonalInfoDTO {
  @IsNotEmpty()
  @IsString()
  userName: string;
}
