import { AuctionStatus, AuctionType, DurationUnits } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsNotEmpty,
  IsNotEmptyObject,
  IsNumber,
  IsOptional,
  MinDate,
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
  @MinDate(new Date(), {
    message: `Can't Create Auction Before today`,
  })
  startDate: Date;

  @IsNotEmptyObject()
  product: ProductDTO;

  @IsNotEmpty()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  locationId: number;
}
