import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
} from 'class-validator';

export class LocationDTO {
  @IsNotEmpty()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  countryId: number;

  @IsNotEmpty()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  cityId: number;

  @IsNotEmpty()
  @IsString()
  address: string;

  @IsNotEmpty()
  @IsString()
  addressLabel: string;

  @IsOptional()
  @IsString()
  zipCode: string;

  @IsOptional()
  @IsPhoneNumber()
  phone: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  lat: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  lng: number;
}
