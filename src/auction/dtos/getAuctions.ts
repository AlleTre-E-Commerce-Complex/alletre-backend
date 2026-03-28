import { AuctionStatus, UsageStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

function parseNumbers(arrayOfItems: string[]): number[] {
  // Convert each string to a number
  const numbers = arrayOfItems.map((item) => parseInt(item));
  // Return the array of numbers
  return numbers;
}
export class GetAuctionsDTO {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  page: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  perPage: number;

  @IsOptional()
  @Transform(({ value }) => parseNumbers(value))
  @IsArray()
  @IsNumber({}, { each: true })
  categories: number[];

  @IsOptional()
  @Transform(({ value }) => parseNumbers(value))
  @IsArray()
  @IsNumber({}, { each: true })
  subCategory: number[];

  @IsOptional()
  // @Transform(({ value }) => parseNumbers(value))
  @IsArray()
  // @IsNumber({}, { each: true })
  brands: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  brand?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  model?: string[];

  @IsOptional()
  @Transform(({ value }) => parseNumbers(value))
  @IsArray()
  @IsNumber({}, { each: true })
  countries: number[];

  @IsOptional()
  @IsString()
  sellingType: string;

  @IsOptional()
  @IsArray()
  usageStatus: UsageStatus[];

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  priceFrom: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  priceTo: number;

  @IsOptional()
  @IsString()
  title: string;

  @IsOptional()
  @IsIn(Object.keys(AuctionStatus))
  auctionStatus: AuctionStatus;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isHome: boolean;

  // Dynamic Product Fields
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  regionalSpecs?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  bodyType?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  seatingCapacity?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  transmissionType?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  fuelType?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  exteriorColor?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  interiorColor?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  horsepower?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  engineCapacity?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  doors?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  warranty?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  cylinders?: string[];

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  propertyType?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  amenities?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  bedrooms?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  bathrooms?: string[];
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  furnished?: string[];

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  minYear?: number;
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  maxYear?: number;
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  minKilometer?: number;
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  maxKilometer?: number;
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  minSqft?: number;
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  maxSqft?: number;
  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
