import { IsOptional, IsString, IsArray } from 'class-validator';

export class ProductUpdateDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
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
}
