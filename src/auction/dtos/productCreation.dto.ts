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
  @IsString()
  brand: string;

  @IsOptional()
  @IsString()
  description?: string;

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
  @IsString()
  numberOfRooms: string;

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

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  ProductListingPrice: number;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  locationId: number;

  @IsOptional()
  @IsString()
  carType: string;

  @IsOptional()
  @IsString()
  trim: string;

  @IsOptional()
  @IsString()
  regionalSpecs: string;

  @IsOptional()
  @IsString()
  kilometers: string;

  @IsOptional()
  @IsString()
  interiorColor: string;

  @IsOptional()
  @IsString()
  insuredInUae: string;

  @IsOptional()
  @IsString()
  warranty: string;

  @IsOptional()
  @IsString()
  fuelType: string;

  @IsOptional()
  @IsString()
  doors: string;

  @IsOptional()
  @IsString()
  transmissionType: string;

  @IsOptional()
  @IsString()
  seatingCapacity: string;

  @IsOptional()
  @IsString()
  horsepower: string;

  @IsOptional()
  @IsString()
  steeringSide: string;

  @IsOptional()
  @IsString()
  engineCapacity: string;

  @IsOptional()
  @IsString()
  numberOfCylinders: string;

  @IsOptional()
  @IsString()
  driverAssistance: string;

  @IsOptional()
  @IsString()
  entertainment: string;

  @IsOptional()
  @IsString()
  comfort: string;

  @IsOptional()
  @IsString()
  exteriorFeatures: string;

  @IsOptional()
  @IsString()
  emirate: string;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  totalClosingFee: number;

  @IsOptional()
  @IsString()
  numberOfBathrooms: string;

  @IsOptional()
  @IsString()
  developer: string;

  @IsOptional()
  @IsString()
  readyBy: string;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  annualCommunityFee: number;

  @IsOptional()
  @IsString()
  isFurnished: string;

  @IsOptional()
  @IsString()
  propertyReferenceId: string;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  buyerTransferFee: number;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  sellerTransferFee: number;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  maintenanceFee: number;

  @IsOptional()
  @IsString()
  occupancyStatus: string;

  @IsOptional()
  @IsString()
  amenities: string;

  @IsOptional()
  @IsString()
  zonedFor: string;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  approvedBuildUpArea: number;

  @IsOptional()
  @IsString()
  freehold: string;

  @IsOptional()
  @IsString()
  residentialType: string;

  @IsOptional()
  @IsString()
  commercialType: string;
}
