import { Module } from '@nestjs/common';
import { WithdrawalController } from './withdrawal.control';
import { WithdrawalService } from './withdrawal.service';
import { PrismaService } from 'src/prisma/prisma.service'; // Import your Prisma service if you're using Prisma

@Module({
  controllers: [WithdrawalController],
  providers: [WithdrawalService, PrismaService], // Add PrismaService if you're using it
})
export class WithdrawalModule {}
