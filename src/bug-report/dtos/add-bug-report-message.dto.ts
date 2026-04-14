import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class AddBugReportMessageDTO {
  @IsNotEmpty()
  @IsString()
  message: string;
}
