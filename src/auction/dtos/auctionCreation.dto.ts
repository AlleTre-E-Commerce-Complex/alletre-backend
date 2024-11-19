import { AuctionStatus, AuctionType, DurationUnits } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsNotEmptyObject,
  IsNumber,
  IsOptional,
  MinDate,
  ValidateNested,
} from 'class-validator';
import { ProductDTO } from './productCreation.dto';
import { IsString } from '@nestjs/class-validator';

export class AuctionCreationDTO {
  @IsNotEmpty()
  @IsIn(Object.keys(AuctionType))
  type: AuctionType;

  @IsNotEmpty()
  @IsIn(Object.keys(DurationUnits))
  durationUnit: DurationUnits;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  durationInDays: number;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  durationInHours: number;

  @IsNotEmpty()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  startBidAmount: number;

  @IsOptional()
  @IsString()
  @IsIn(['YES'])
  isBuyNowAllowed: string;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  acceptedAmount: number;

  @IsOptional()
  @IsDate()
  @Transform(({ value }): Date => new Date(value))
  @MinDate(new Date(new Date().setDate(new Date().getDate() - 1)), {
    message: `Can't Create Auction Before today`,
  })
  startDate: Date;

  @IsDefined()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => ProductDTO)
  product: ProductDTO;

  @IsNotEmpty()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  locationId: number;

  @IsOptional()
  @IsString()
  IsDelivery: string;

  @IsOptional()
  @IsString()
  deliveryPolicyDescription: string;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  numOfDaysOfExpecetdDelivery: number;

  @IsOptional()
  @IsString()
  IsRetrunPolicy: string;

  @IsOptional()
  @IsString()
  returnPolicyDescription: string;

  @IsOptional()
  @IsString()
  IsWaranty: string;

  @IsOptional()
  @IsString()
  warrantyPolicyDescription: string;
}
