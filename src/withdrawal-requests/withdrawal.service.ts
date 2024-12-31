import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { WithdrawalStatus } from '@prisma/client';
@Injectable()
export class WithdrawalService {
  constructor(private readonly prisma: PrismaService) {}


  async getAllWithdrawalRequests() {
    return this.prisma.withdrawalRequests.findMany({
      include: {
        user: true,
        bankAccount: true,
      },
    });
  }

  async approveWithdrawalRequest(id: number, withdrawalStatus: string) {
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
