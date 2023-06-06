import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AuctionStatus, JoinedAuctionStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private prismaService: PrismaService) {}

  /**
   * Function will run every mintue to set all auction expired
   */
  @Interval(60000) // Run every minute (adjust the interval as per your requirements)
  async handleCron() {
    await this._markExpiredAuctionsAndNotifyWinnerBidder();
  }

  async _markExpiredAuctionsAndNotifyWinnerBidder() {
    // Get expiredAuctions
    const expiredAuctions = await this.prismaService.auction.findMany({
      where: {
        expiryDate: {
          lte: new Date(), // Filter auctions where expiryDate is less than or equal to the current date and time
        },
        status: {
          not: AuctionStatus.EXPIRED, // Exclude auctions that are already marked as expired
        },
      },
    });

    for (const auction of expiredAuctions) {
      // Set auction expired to stop bids
      await this.prismaService.auction.update({
        where: {
          id: auction.id,
        },
        data: {
          status: AuctionStatus.EXPIRED, // Update the status of the auction to 'EXPIRED'
          endDate: new Date(), // Set the endDate to the current date and time
        },
      });

      // Get user with highest bids for auctions
      const highestBid = await this.prismaService.bids.findFirst({
        where: { auctionId: auction.id },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      // Get winner joinedAuction
      const bidderJoinedAuction =
        await this.prismaService.joinedAuction.findFirst({
          where: {
            userId: highestBid.userId,
            auctionId: highestBid.auctionId,
          },
        });

      // Update winner joinedAuction to winner and waiting for payment
      await this.prismaService.joinedAuction.update({
        where: { id: bidderJoinedAuction.id },
        data: { status: JoinedAuctionStatus.PENDING_PAYMENT },
      });

      //TODO: Notify user
    }
  }
}
