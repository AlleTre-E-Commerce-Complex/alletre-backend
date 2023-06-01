import { Injectable, MethodNotAllowedException } from '@nestjs/common';
import {
  AuctionStatus,
  AuctionType,
  DurationUnits,
  PaymentStatus,
  User,
} from '@prisma/client';
import { StripeService } from 'src/common/services/stripe.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly stripeService: StripeService,
    private readonly prismaService: PrismaService,
  ) {}

  async payDepositBySeller(
    user: User,
    auctionId: number,
    currency: string,
    amount: number,
  ) {
    // Create SripeCustomer if has no account
    let stripeCustomerId: string;
    if (!user?.stripeId) {
      stripeCustomerId = await this.stripeService.createCustomer(
        user.email,
        user.userName,
      );

      // Add to user stripeCustomerId
      await this.prismaService.user.update({
        where: { id: user.id },
        data: { stripeId: stripeCustomerId },
      });
    }

    // Check if user has already pay for auction
    const userPaymentForAuction = await this.getUserAuctionPayment(
      user.id,
      auctionId,
    );
    if (userPaymentForAuction) {
      // Retrieve PaymentIntent and clientSecret for clientSide
      const paymentIntent = await this.stripeService.retrievePaymentIntent(
        userPaymentForAuction.paymentIntentId,
      );

      if (paymentIntent.status === 'succeeded')
        throw new MethodNotAllowedException('already paid');

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    }

    // Create PaymentIntent
    const { clientSecret, paymentIntentId } =
      await this.stripeService.createPaymentIntent(
        stripeCustomerId,
        amount,
        currency,
      );

    //TODO:  Add currency in payment model
    await this.prismaService.payment.create({
      data: {
        userId: user.id,
        auctionId: auctionId,
        amount: amount,
        paymentIntentId: paymentIntentId,
      },
    });
    return { clientSecret, paymentIntentId };
  }

  async webHookEventHandler(payload: Buffer, stripeSignature: string) {
    const webHookResult = await this.stripeService.webHookHandler(
      payload,
      stripeSignature,
    );

    switch (webHookResult.status) {
      case PaymentStatus.SUCCESS:
        const auctionPayment = await this.prismaService.payment.findUnique({
          where: { paymentIntentId: webHookResult.paymentIntentId },
        });

        // Update Auction
        await this.publishAuction(auctionPayment.auctionId);

        // Update Payment
        await this.prismaService.payment.update({
          where: { paymentIntentId: webHookResult.paymentIntentId },
          data: { status: PaymentStatus.SUCCESS },
        });
        break;
    }
  }

  async getUserAuctionPayment(userId: number, auctionId: number) {
    return await this.prismaService.payment.findFirst({
      where: {
        userId,
        auctionId,
      },
    });
  }
  async publishAuction(auctionId: number) {
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
    });

    switch (auction.durationUnit) {
      case DurationUnits.DAYS:
        if (auction.type === AuctionType.ON_TIME || !auction.startDate) {
          // Set ON_TIME Daily auction ACTIVE
          const today = new Date();
          const expiryDate = this.addDays(new Date(), auction.durationInDays);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              startDate: today,
              expiryDate: expiryDate,
            },
          });
        } else if (
          auction.type === AuctionType.SCHEDULED ||
          auction.startDate
        ) {
          // Set Schedule Daily auction ACTIVE
          const startDate = auction.startDate;
          const expiryDate = this.addDays(startDate, auction.durationInDays);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              expiryDate: expiryDate,
            },
          });
        }
        break;

      case DurationUnits.HOURS:
        if (auction.type === AuctionType.ON_TIME || !auction.startDate) {
          // Set ON_TIME hours auction ACTIVE
          const today = new Date();
          const expiryDate = this.addHours(new Date(), auction.durationInHours);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              startDate: today,
              expiryDate: expiryDate,
            },
          });
        } else if (
          auction.type === AuctionType.SCHEDULED ||
          auction.startDate
        ) {
          // Set Schedule hours auction ACTIVE
          const startDate = auction.startDate;
          const expiryDate = this.addHours(startDate, auction.durationInHours);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              expiryDate: expiryDate,
            },
          });
        }
    }
  }

  addHours(date: Date, hours: number) {
    const newDate = new Date(date.getTime() + hours * 60 * 60 * 1000);
    return newDate;
  }

  addDays(date: Date, days: number) {
    const currentDate = date;
    const newDate = new Date(currentDate.setDate(currentDate.getDate() + days));
    return newDate;
  }
}
