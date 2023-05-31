import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
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
    // Create tSripeCustomer if has no account
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

    // Create PaymentIntent
    const paymentIntentResult = await this.stripeService.createPaymentIntent(
      stripeCustomerId,
      amount,
      currency,
    );

    //TODO: Create payment record with (userId,paymentIntentId,auctionId)

    return paymentIntentResult;
  }
}
