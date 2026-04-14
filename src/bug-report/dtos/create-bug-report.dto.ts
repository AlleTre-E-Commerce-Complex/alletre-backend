import {
  IsOptional,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsEmail,
} from 'class-validator';
import { ProblemStatus } from '@prisma/client';

export class CreateBugReportDTO {
  @IsNotEmpty()
  @IsString()
  description: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(ProblemStatus)
  status?: ProblemStatus;
}

export class UpdateBugReportStatusDTO {
  @IsNotEmpty()
  @IsEnum(ProblemStatus)
  status: ProblemStatus;
}
