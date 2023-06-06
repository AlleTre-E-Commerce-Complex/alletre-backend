import { JoinedAuctionStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class GetJoinAuctionsDTO {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  page: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  perPage: number;

  @IsNotEmpty()
  @IsIn(Object.keys(JoinedAuctionStatus))
  status: JoinedAuctionStatus;
}
