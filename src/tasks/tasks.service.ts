import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import {
  AuctionStatus,
  JoinedAuctionStatus,
  PaymentStatus,
  PaymentType,
} from '@prisma/client';
import { UserAuctionsService } from 'src/auction/services/user-auctions.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prismaService: PrismaService,
    private userAuctionService: UserAuctionsService,
  ) {}

  /**
   * Function will run every hour to get inschdeule and publish them if paid
   */
  @Interval(60000)
  async publishAllInScheduleAuction() {
    console.log('publish AllInSchedule Auction cron job on fire');

    // Get InSchedule auctions
    const inScheduleAuctions = await this.prismaService.auction.findMany({
      where: {
        status: AuctionStatus.IN_SCHEDULED,
        startDate: { lte: new Date() },
        Payment: {
          every: {
            type: PaymentType.SELLER_DEPOSIT,
            status: PaymentStatus.SUCCESS,
          },
        },
      },
    });

    console.log(inScheduleAuctions);

    for (const auction of inScheduleAuctions) {
      // Set payment expired
      await this.prismaService.auction.update({
        where: { id: auction.id },
        data: { status: AuctionStatus.ACTIVE },
      });
    }

    //TODO: Notify all users
  }

  /**
   * Function will run midnight to set all joined auction must be paid by bidder Expired_Payment
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markPendingBidderPaymentAuctionsExpired() {
    // Get pending payment auctions
    const pendingPaymentAuction =
      await this.prismaService.joinedAuction.findMany({
        where: {
          paymentExpiryDate: { lte: new Date() },
          status: JoinedAuctionStatus.PENDING_PAYMENT,
        },
      });

    for (const joinedAuction of pendingPaymentAuction) {
      // Set payment expired
      await this.prismaService.joinedAuction.update({
        where: { id: joinedAuction.id },
        data: { status: JoinedAuctionStatus.PAYMENT_EXPIRED },
      });
    }

    //TODO: Notify all users
  }

  /**
   * Function will run every mintue to set all auction expired
   */
  @Interval(60000)
  async markAuctionExpired() {
    await this._markExpiredAuctionsAndNotifyWinnerBidder();
  }

  async _markExpiredAuctionsAndNotifyWinnerBidder() {
    // Get expiredAuctions
    const expiredAuctions = await this.prismaService.auction.findMany({
      where: {
        expiryDate: {
          lte: new Date(), // Filter auctions where expiryDate is less than or equal to the current date and time
        },
        status: AuctionStatus.ACTIVE,
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

      // Get winner winnedBidderAuction
      const winnedBidderAuction =
        await this.prismaService.joinedAuction.findFirst({
          where: {
            userId: highestBid.userId,
            auctionId: highestBid.auctionId,
          },
        });

      // Update winner joinedAuction to winner and waiting for payment & Set all joined to LOST
      const today = new Date();
      const newDate = new Date(today.setDate(today.getDate() + 3));

      await this.prismaService.$transaction([
        this.prismaService.joinedAuction.update({
          where: { id: winnedBidderAuction.id },
          data: {
            status: JoinedAuctionStatus.PENDING_PAYMENT,
            paymentExpiryDate: newDate,
          },
        }),

        this.prismaService.joinedAuction.updateMany({
          where: { auctionId: auction.id, id: { not: winnedBidderAuction.id } },
          data: { status: JoinedAuctionStatus.LOST },
        }),
      ]);

      //TODO: Notify user

      this.userAuctionService.notifyAuctionWinner(highestBid.userId);
    }
  }
}
