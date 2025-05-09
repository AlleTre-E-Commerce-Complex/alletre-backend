import { IsOptional } from '@nestjs/class-validator';
import { WalletStatus, WalletTransactionType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDate, IsIn, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateWalletDtoFromAdminSide {
  @IsNotEmpty()
  @IsIn(Object.keys(WalletStatus))
  status: WalletStatus;

  @IsOptional()
  @IsIn(Object.keys(WalletTransactionType))
  transactionType: WalletTransactionType;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  transactionReference?: string;

  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  amount: number;

  @IsOptional()
  @Transform(({ value }): number => parseFloat(value))
  @IsNumber()
  balance?: number;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  auctionId?: number;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  purchaseId?: number;

  @IsOptional()
  @Transform(({ value }): number => parseInt(value))
  @IsNumber()
  userId?: number;

}
