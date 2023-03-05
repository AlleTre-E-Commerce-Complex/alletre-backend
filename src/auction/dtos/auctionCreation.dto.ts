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

export class AuctionCreationDTO {
  @IsNotEmpty()
  @IsIn(Object.keys(AuctionType))
  type: AuctionType;

  @IsNotEmpty()
  @IsIn(Object.keys(DurationUnits))
  durationUnit: DurationUnits;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  durationInDays: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  durationInHours: number;

  @IsNotEmpty()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  startBidAmount: number;

  @IsOptional()
  isBuyNowAllowed: boolean;

  @IsOptional()
  @Transform(({ value }) => Number(value))
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
  @Transform(({ value }) => Number(value))
  @IsNumber()
  locationId: number;
}
