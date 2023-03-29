import { Transform } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';

export class PaginationDTO {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  page: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  perPage: number;
}
