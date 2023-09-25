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
      await this.prismaService.$transaction([
        // Set auction now expired
        this.prismaService.auction.update({
          where: { id: joinedAuction.auctionId },
          data: { status: AuctionStatus.EXPIRED },
        }),

        // Set joinedauction now expired
        this.prismaService.joinedAuction.update({
          where: { id: joinedAuction.id },
          data: { status: JoinedAuctionStatus.PAYMENT_EXPIRED },
        }),
      ]);
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
    console.log(' Start Expiration Schedular ');

    // Get expiredAuctions
    const auctionsToBeExpired = await this.prismaService.auction.findMany({
      where: {
        expiryDate: {
          lte: new Date(), // Filter auctions where expiryDate is less than or equal to the current date and time
        },
        status: AuctionStatus.ACTIVE,
      },
    });

    for (const auction of auctionsToBeExpired) {
      console.log(' Auction = ', auction);

      // Get user with highest bids for auctions
      const highestBidForAuction = await this.prismaService.bids.findFirst({
        where: { auctionId: auction.id },
        orderBy: { amount: 'desc' },
      });

      console.log('Max Bid = ', highestBidForAuction);

      if (highestBidForAuction) {
        console.log('There is max bid');

        // Get winner winnedBidderAuction
        const winnedBidderAuction =
          await this.prismaService.joinedAuction.findFirst({
            where: {
              userId: highestBidForAuction.userId,
              auctionId: highestBidForAuction.auctionId,
            },
          });

        // Update winner joinedAuction to winner and waiting for payment & Set all joined to LOST
        const today = new Date();
        const newDate = new Date(today.setDate(today.getDate() + 3));

        await this.prismaService.$transaction([
          // Set auction to waiting for payment from winner to stop bids
          this.prismaService.auction.update({
            where: {
              id: auction.id,
            },
            data: {
              status: AuctionStatus.WAITING_FOR_PAYMENT, // Update the status of the auction to 'WAITING_FOR_PAYMENT'
              endDate: new Date(), // Set the endDate to the current date and time
            },
          }),

          this.prismaService.joinedAuction.update({
            where: { id: winnedBidderAuction.id },
            data: {
              status: JoinedAuctionStatus.PENDING_PAYMENT,
              paymentExpiryDate: newDate,
            },
          }),

          this.prismaService.joinedAuction.updateMany({
            where: {
              auctionId: auction.id,
              id: { not: winnedBidderAuction.id },
            },
            data: { status: JoinedAuctionStatus.LOST },
          }),
        ]);

        //TODO: Notify user
        await this.userAuctionService.notifyAuctionWinner(
          highestBidForAuction.userId,
        );
        console.log('User notified');
      }
      // Set auction to EXPIRED
      else
        await this.prismaService.auction.update({
          where: {
            id: auction.id,
          },
          data: {
            status: AuctionStatus.EXPIRED, // Update the status of the auction to 'EXPIRED'
            endDate: new Date(), // Set the endDate to the current date and time
          },
        });
    }
  }
}
