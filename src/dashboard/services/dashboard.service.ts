import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuctionStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
    const [
      totalUsers,
      liveAuctions,
      scheduledAuctions,
      listedProducts,
      paymentPendingAuctions,
      deliveryPendingAuctions,
      // totalProfit,
    ] = await Promise.all([
      // Get total users
      this.prisma.user.count(),

      // Get live auctions count
      this.prisma.auction
        .count({
          where: {
            status: AuctionStatus.ACTIVE,
          },
        })
        .then((count) => {
          return count;
        }),

      // Get scheduled auctions count
      this.prisma.auction.count({
        where: {
          status: AuctionStatus.IN_SCHEDULED,
        },
      }),

      // Get listed products count
      this.prisma.listedProducts.count(),

      // Get payment pending auctions count
      this.prisma.auction.count({
        where: {
          status: AuctionStatus.WAITING_FOR_PAYMENT,
        },
      }),

      // Get delivery pending auctions count
      this.prisma.auction.count({
        where: {
          AND: [
            { deliveryRequestsStatus: 'DELIVERY_PENDING' },
            { status: AuctionStatus.SOLD },
          ],
        },
      }),

      // Get total profit
      Promise.resolve({ _sum: { amount: 0 } }),
    ]);

    return {
      totalUsers,
      liveAuctions,
      scheduledAuctions,
      listedProducts,
      paymentPending: paymentPendingAuctions || 0,
      deliveryPending: deliveryPendingAuctions || 0,
    };
  }
}
