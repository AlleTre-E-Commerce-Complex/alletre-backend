import { Transform } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

class CustomFieldDTO {
  @IsString()
  key: string;

  @IsString()
  resKey: string;

  @IsString()
  type: string;

  @IsString()
  labelAr: string;

  @IsString()
  labelEn: string;
}

class SubCategoryDTO {
  @IsString()
  nameAr: string;

  @IsString()
  nameEn: string;

  @IsArray()
  @IsOptional()
  customFields: CustomFieldDTO[];
}

export class CreateCategoryDTO {
  @IsString()
  nameAr: string;

  @IsString()
  nameEn: string;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  bidderDepositFixedAmount: number;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  sellerDepositFixedAmount: number;

  @IsArray()
  @IsOptional()
  subCategories: SubCategoryDTO[];
}
