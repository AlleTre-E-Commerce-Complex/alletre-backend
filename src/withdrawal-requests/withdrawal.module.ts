import { Module } from '@nestjs/common';
import { WithdrawalController } from './withdrawal.control';
import { WithdrawalService } from './withdrawal.service';
import { PrismaService } from 'src/prisma/prisma.service'; // Import your Prisma service if you're using Prisma
import { WalletService } from 'src/wallet/wallet.service';

@Module({
  controllers: [WithdrawalController],
  providers: [WithdrawalService, PrismaService, WalletService], // Add PrismaService if you're using it
})
export class WithdrawalModule {}
