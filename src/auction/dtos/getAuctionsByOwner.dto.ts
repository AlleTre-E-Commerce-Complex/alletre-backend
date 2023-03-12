import { AuctionStatus, AuctionType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
} from 'class-validator';

export class GetAuctionsByOwnerDTO {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  page: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  perPage: number;

  @IsNotEmpty()
  @IsIn(Object.keys(AuctionStatus))
  status: AuctionStatus;

  @IsOptional()
  @IsIn(Object.keys(AuctionType))
  type: AuctionType;
}
