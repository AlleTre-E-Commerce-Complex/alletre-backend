import {
  IsOptional,
  IsString,
  IsIn,
  IsArray,
  IsNumber,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class ProductUpdateDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @ValidateIf(
    (o) =>
      o.description !== '' &&
      o.description !== null &&
      o.description !== undefined,
  )
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  carType?: string;

  @IsOptional()
  @IsString()
  trim?: string;

  @IsOptional()
  @IsString()
  regionalSpecs?: string;

  @IsOptional()
  @IsString()
  kilometers?: string;

  @IsOptional()
  @IsString()
  interiorColor?: string;

  @IsOptional()
  @IsString()
  insuredInUae?: string;

  @IsOptional()
  @IsString()
  warranty?: string;

  @IsOptional()
  @IsString()
  fuelType?: string;

  @IsOptional()
  @IsString()
  doors?: string;

  @IsOptional()
  @IsString()
  transmissionType?: string;

  @IsOptional()
  @IsString()
  seatingCapacity?: string;

  @IsOptional()
  @IsString()
  horsepower?: string;

  @IsOptional()
  @IsString()
  steeringSide?: string;

  @IsOptional()
  @IsString()
  engineCapacity?: string;

  @IsOptional()
  @IsString()
  numberOfCylinders?: string;

  @IsOptional()
  @IsString()
  driverAssistance?: string;

  @IsOptional()
  @IsString()
  entertainment?: string;

  @IsOptional()
  @IsString()
  comfort?: string;

  @IsOptional()
  @IsString()
  exteriorFeatures?: string;

  @IsOptional()
  @IsString()
  emirate?: string;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  totalClosingFee?: number;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  numberOfBathrooms?: number;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  numberOfRooms?: number;

  @IsOptional()
  @IsString()
  developer?: string;

  @IsOptional()
  @IsString()
  readyBy?: string;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  annualCommunityFee?: number;

  @IsOptional()
  @IsString()
  isFurnished?: string;

  @IsOptional()
  @IsString()
  propertyReferenceId?: string;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  buyerTransferFee?: number;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  sellerTransferFee?: number;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  maintenanceFee?: number;

  @IsOptional()
  @IsString()
  occupancyStatus?: string;

  @IsOptional()
  @IsString()
  amenities?: string;

  @IsOptional()
  @IsString()
  zonedFor?: string;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  approvedBuildUpArea?: number;

  @IsOptional()
  @IsString()
  freehold?: string;

  @IsOptional()
  @IsString()
  residentialType?: string;

  @IsOptional()
  @IsString()
  commercialType?: string;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  ProductListingPrice?: number;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  locationId?: number;

  @IsOptional()
  @IsString()
  @IsIn(['FIXED', 'NEGOTIABLE'])
  priceType?: string;
}
