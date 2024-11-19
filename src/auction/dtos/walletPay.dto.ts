import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class WalletPayDto {
  @IsNotEmpty()
  // @Transform(({ value }): number => parseInt(value))
  @Type(() => Number)
  @IsInt() // Ensures that auctionId is an integer
  auctionId: number;

  @IsNotEmpty()
  // @Transform(({ value }): number => parseFloat(value))
  @Type(() => Number)
  @IsNumber() // Ensures that amount is a number (can be float or int)
  amount: number;

  @IsOptional()
  // @Transform(({ value }): number => parseFloat(value))
  @Type(() => Number)
  @IsNumber() // Ensures that amount is a number (can be float or int)
  // bidAmount: number;
  submitBidValue: number;
}
