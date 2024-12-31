import { Injectable, MethodNotAllowedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  WalletStatus,
  WalletTransactionType,
  WithdrawalStatus,
} from '@prisma/client';
import { WalletService } from 'src/wallet/wallet.service';
@Injectable()
export class WithdrawalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {}

  async getAllWithdrawalRequests() {
    return this.prisma.withdrawalRequests.findMany({
      include: {
        user: true,
        bankAccount: true,
      },
    });
  }

  async approveWithdrawalRequest(id: number, withdrawalStatus: string) {
    console.log('test withdrawal');
    const currentRequest = await this.prisma.withdrawalRequests.findUnique({
      where: { id },
    });

    if (!currentRequest) {
      throw new Error('Withdrawal request not found');
    }

    let newStatus: WithdrawalStatus;
    if (withdrawalStatus === 'PENDING') {
      newStatus = 'IN_PROGRESS';
    } else if (withdrawalStatus === 'IN_PROGRESS') {
      newStatus = 'SUCCESS';
      const lastWalletTransactionBalanceOfUser =
        await this.walletService.findLastTransaction(currentRequest.userId);
      const UserBalance = Number(lastWalletTransactionBalanceOfUser) || 0;

      if (UserBalance < Number(currentRequest.amount)) {
        throw new MethodNotAllowedException('Sorry, Insufficient Balance.');
      }
      const userWithdrawalWalletData = {
        status: WalletStatus.WITHDRAWAL,
        transactionType: WalletTransactionType.By_AUCTION,
        description: `Withdrawal to you bank account`,
        amount: Number(currentRequest.amount),
        balance: UserBalance - Number(currentRequest.amount),
      };
      const isMoneyDeducted = await this.walletService.create(
        currentRequest.userId,
        userWithdrawalWalletData,
      );
      console.log('isMoneyDeducted :', isMoneyDeducted);
    } else {
      throw new Error(
        `Invalid status transition from ${currentRequest.withdrawalStatus} to ${withdrawalStatus}`,
      );
    }

    const updatedRequest = await this.prisma.withdrawalRequests.update({
      where: { id },
      data: { withdrawalStatus: newStatus },
    });

    return updatedRequest;
  }
}
