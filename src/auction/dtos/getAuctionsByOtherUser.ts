import { AuctionStatus, AuctionType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
} from 'class-validator';

export class GetAuctionsByOtherUserDTO {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  page: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  perPage: number;

  @IsNotEmpty()
  @IsOptional()
  @IsIn(Object.keys(AuctionStatus))
  status: AuctionStatus;

  @IsOptional()
  @IsIn(Object.keys(AuctionType))
  type: AuctionType;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  userId: number;
}
