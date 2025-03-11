import { ListedProductsStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class GetListedProductByOhterUserDTO {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  page: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  perPage: number;

  @IsOptional()
  @IsNotEmpty()
  @IsIn(Object.keys(ListedProductsStatus))
  status: ListedProductsStatus;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  userId: number;
}
