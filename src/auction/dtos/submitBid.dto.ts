import { IsNotEmpty } from '@nestjs/class-validator';
import { Transform } from 'class-transformer';
import { IsNumber } from 'class-validator';

export class SubmitBidDTO {
  @IsNotEmpty()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  auctionId: number;

  @IsNotEmpty()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  bidAmount: number;
}
