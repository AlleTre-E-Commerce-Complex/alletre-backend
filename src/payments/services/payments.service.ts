import { Injectable, MethodNotAllowedException } from '@nestjs/common';
import { PaymentStatus, User } from '@prisma/client';
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
        // TODO: Update payment & Auction
        await this.prismaService.payment.update({
          where: { paymentIntentId: webHookResult.paymentIntentId },
          data: { status: PaymentStatus.SUCCESS },
        });
        break;

      default:
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
}