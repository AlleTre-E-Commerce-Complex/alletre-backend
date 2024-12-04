import { UsageStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class ProductDTO {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  model: string;

  @IsNotEmpty()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  categoryId: number;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  brandId: number;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  subCategoryId: number;

  @IsOptional()
  @IsIn(Object.keys(UsageStatus))
  usageStatus: UsageStatus;

  @IsOptional()
  @IsString()
  color: string;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  screenSize: number;

  @IsOptional()
  @IsString()
  processor: string;

  @IsOptional()
  @IsString()
  operatingSystem: string;

  @IsOptional()
  @IsString()
  releaseYear: string;

  @IsOptional()
  @IsString()
  regionOfManufacture: string;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  ramSize: number;

  @IsOptional()
  @IsString()
  @IsIn(['digital', 'compact', 'mirrorless interchangeable lens'])
  cameraType: string;

  @IsOptional()
  @IsString()
  material: string;

  @IsOptional()
  @IsString()
  memory: string;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  age: number;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  totalArea: number;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  numberOfRooms: number;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  numberOfFloors: number;

  @IsOptional()
  @IsString()
  @IsIn(['industrial', 'agricultural', 'residential'])
  landType: string;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  countryId: number;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  cityId: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isOffer: boolean;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  offerAmount: number;
}
