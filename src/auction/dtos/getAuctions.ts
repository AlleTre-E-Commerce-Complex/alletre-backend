import { AuctionType, UsageStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
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
  brands: number[];

  @IsOptional()
  @Transform(({ value }) => parseNumbers(value))
  @IsArray()
  @IsNumber({}, { each: true })
  countries: number[];

  @IsOptional()
  @IsString({ each: true })
  sellingType: string[];

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
}
