import { UsageStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class AuctionCreationDTO {
  @IsNotEmpty()
  @IsString()
  @Min(3)
  title: string;

  @IsNotEmpty()
  @IsString()
  model: string;

  @IsNotEmpty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  categoryId: number;

  @IsNotEmpty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  brandId: number;

  @IsNotEmpty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  price: number;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  subCategoryId: number;

  @IsOptional()
  @IsIn(Object.keys(UsageStatus))
  usageStatus: UsageStatus;

  @IsOptional()
  @IsString()
  color: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
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
  @Transform(({ value }) => Number(value))
  @IsNumber()
  ramSize: number;

  @IsOptional()
  @IsString()
  @IsIn(['digital', 'compact', 'mirror', 'less interchangeable lens'])
  cameraType: string;

  @IsOptional()
  @IsString()
  @IsIn(['digital', 'compact', 'mirror', 'less interchangeable lens'])
  material: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  age: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  totalArea: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  numberOfRooms: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  numberOfFloors: number;

  @IsOptional()
  @IsString()
  @IsIn(['industrial', 'agricultural', 'residential'])
  landType: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  countryId: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  cityId: number;
}
