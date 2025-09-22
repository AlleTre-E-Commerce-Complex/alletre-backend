import { Injectable, MethodNotAllowedException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import Stripe from 'stripe';
import { MethodNotAllowedResponse } from '../errors';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(private readonly prismaService: PrismaService) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2022-11-15',
    });
  }

  async createCustomer(email: string, userName: string) {
    const stripeCustomer = await this.stripe.customers.create({
      email,
      name: userName,
    });

    return stripeCustomer.id;
  }

  // Modify the existing createPaymentIntent method
  async createDepositPaymentIntent(
    stripeCustomerId: string,
    amount: number,
    currency: string,
    metadata?: any,
  ) {
    const amountInSmallestUnit = amount * 100;
    console.log(
      '-------------Amount To Be Paid:------------ ',
      amountInSmallestUnit,
    );
    console.log(
      'stripeCustomerId in createDepositPaymentIntent:',
      stripeCustomerId,
    );

    let paymentIntent: any;
    try {
      paymentIntent = await this.stripe.paymentIntents.create({
        // customer: stripeCustomerId,
        amount: Math.ceil(amountInSmallestUnit),
        currency: currency,
        capture_method: 'manual', // Authorize only, don't capture immediately
        setup_future_usage: 'off_session',
        automatic_payment_methods: {
          enabled: true,
        },
        metadata,
      });
    } catch (error) {
      console.log('Error in createDepositPaymentIntent:', error);
      throw new MethodNotAllowedResponse({
        ar: 'قيمة عملية الدفع غير صالحة',
        en: 'Invalid Payment Amount',
      });
    }
    console.log('Create Deposite Payment Intent---->', paymentIntent);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  }

  // Add a method to capture the authorized payment
  async captureDepositPaymentIntent(paymentIntentId: string) {
    try {
      console.log('captureDepositPaymentIntent: -->', paymentIntentId);

      const capturedPaymentIntent = await this.stripe.paymentIntents.capture(
        paymentIntentId,
      );
      return capturedPaymentIntent;
    } catch (error) {
      console.error('Error capturing Payment Intent:', error);
      throw new MethodNotAllowedResponse({
        ar: 'فشل في إتمام عملية الدفع',
        en: 'Failed to capture payment.',
      });
    }
  }

  // Add a method to cancel the authorized payment
  async cancelDepositPaymentIntent(paymentIntentId: string) {
    try {
      console.log('cancelDepositPaymentIntent: -->', paymentIntentId);
      const canceledIntent = await this.stripe.paymentIntents.cancel(
        paymentIntentId,
      );
      return canceledIntent;
    } catch (error) {
      console.error('Error canceling Payment Intent:', error);
      throw new MethodNotAllowedResponse({
        ar: 'فشل في إلغاء عملية الدفع',
        en: 'Failed to cancel payment.',
      });
    }
  }

  async createPaymentIntent(
    stripeCustomerId: string,
    amount: number,
    currency: string,
    metadata?: any,
  ) {
    const amountInSmallestUnit = amount * 100;
    console.log(
      '-------------Amount To Be Paid:------------ ',
      amountInSmallestUnit,
    );

    let paymentIntent: any;
    try {
      paymentIntent = await this.stripe.paymentIntents.create({
        customer: stripeCustomerId,
        amount: Math.ceil(amountInSmallestUnit),
        currency: currency,
        setup_future_usage: 'off_session',
        automatic_payment_methods: {
          enabled: true,
        },
        metadata,
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'قيمة عملية الدفع غير صالحة',
        en: 'Invalid Payment Amount',
      });
    }

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  }

  async retrievePaymentIntent(paymentIntentId: string) {
    return await this.stripe.paymentIntents.retrieve(paymentIntentId);
  }

  async updatePaymentIntent(paymentIntentId: string, metadata: any) {
    console.log('updatePaymentIntent :', paymentIntentId, metadata);
    return await this.stripe.paymentIntents.update(paymentIntentId, {
      metadata,
    });
  }

  async createConfirmedPaymentIntent(
    stripeCustomerId: string,
    amount: number,
    currency: string,
  ) {
    const paymentIntent = await this.stripe.paymentIntents.create({
      customer: stripeCustomerId,
      amount: amount,
      currency: currency,
      off_session: true,
      confirm: true,
    });
    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  }

  async webHookHandler(payload: any, stripeSignature: string) {
    //we can use--->   "payment_intent.amount_capturable_updated"   <---event of web hook for handling the HOLD method of stripe

    let event = payload;
    console.log('payload=>', payload, 'stripeSignature==>', stripeSignature);
    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        stripeSignature,
        process.env.WEBHOOK_SECRETS,
      );
    } catch (err) {
      throw new MethodNotAllowedException(`Webhook error ${err.message}`);
    }

    // Handle the event
    console.log(`[IMPORTANT] event type : ${event.type}`);

    // Handle the event

    switch (event.type) {
      case 'payment_intent.amount_capturable_updated':
        const holdPaymentIntent = event.data.object;
        console.log(
          `PaymentIntent for ${holdPaymentIntent.amount} was Holded (authorized)!`,
        );
        const intent = event.data.object;
        const { auctionId, userId, bidAmount } = intent.metadata;

        // ✅ Safely release auction lock and set accepted amount
        await this.prismaService.auction.update({
          where: { id: Number(auctionId) },
          data: {
            isLocked: false,
            lockedByUserId: null,
            lockedAt: null,
          },
        });
        return {
          status: PaymentStatus.HOLD,
          paymentIntent: holdPaymentIntent,
        };
      case 'payment_intent.canceled':
        const cancelPaymentIntent = event.data.object;
        console.log(
          `PaymentIntent for ${cancelPaymentIntent.amount} was Cancelled!`,
        );
        return {
          status: PaymentStatus.CANCELLED,
          paymentIntent: cancelPaymentIntent,
        };
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log(
          `PaymentIntent for ${paymentIntent.amount} was successful!`,
        );
        return {
          status: PaymentStatus.SUCCESS,
          paymentIntent,
        };
      case 'payment_intent.payment_failed':
        const failedPaymentIntent = event.data.object;
        console.log(
          `PaymentIntent for ${failedPaymentIntent.amount} was failed!`,
        );
        const failedIntent = event.data.object;
        const { auction_Id } = failedIntent.metadata;
        const auctionIdNum = Number(auction_Id);
        const auction = await this.prismaService.auction.findUnique({
          where: {
            id: auctionId,
          },
        });
        if (auction?.isLocked) {
          await this.prismaService.auction.update({
            where: { id: auctionIdNum },
            data: {
              isLocked: false,
              lockedByUserId: null,
              lockedAt: null,
            },
          });
        }

        return {
          status: PaymentStatus.FAILED,
          paymentIntent: failedPaymentIntent,
        };

      default:
        // Unexpected event type
        console.log(`Unhandled event type ${event.type}.`);
    }
  }

  /**
   * Check if KYC requirements for the connected account are completed.
   */
  async checkKYCStatus(userId: number) {
    try {
      console.log('checkKYCStatus test 1');
      const user = await this.fetchUserFromDatabase(userId);
      console.log('checkKYCStatus test 2 ');

      // If no connected account exists, create one and save its ID
      if (!user.stripeConnectedAccountId) {
        console.log('checkKYCStatus test 3');
        const account = await this.stripe.accounts.create({
          type: 'express',
          country: 'AE',
          email: user.email,
          business_type: 'individual',
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true },
          },
        });

        console.log('checkKYCStatus test 4', account);
        user.stripeConnectedAccountId = account.id;
        await this.saveConnectedAccountIdToDatabase(userId, account.id);
      }

      // Retrieve the account status and check KYC requirements
      const account = await this.stripe.accounts.retrieve(
        user.stripeConnectedAccountId,
      );
      console.log('checkKYCStatus test 5', account);

      // If there are still KYC fields due, return incomplete status
      if (account.requirements?.currently_due.length > 0) {
        console.log('checkKYCStatus test 6');

        return {
          isKYCComplete: false,
          dueFields: account.requirements.currently_due,
        };
      }
      console.log('checkKYCStatus test 7');

      return { isKYCComplete: true, dueFields: [] };
    } catch (error) {
      console.log('check KYC Error at stripe service file :', error);
      throw new MethodNotAllowedException(
        `Sorry you cannot complete the KYC due to some internal issue..!`,
      );
    }
  }

  /**
   * Create an onboarding link for KYC completion.
   */
  async sendOnboardingLink(userId: number) {
    console.log('sendOnboardingLink 1');
    const user = await this.fetchUserFromDatabase(userId);
    console.log('sendOnboardingLink 2 :', user);

    if (!user.stripeConnectedAccountId) {
      console.log('sendOnboardingLink 3');

      throw new Error('Connected account ID not found');
    }

    const accountLink = await this.stripe.accountLinks.create({
      account: user.stripeConnectedAccountId,
      refresh_url: 'https://example.com/reauth',
      return_url: `${process.env.FRONT_URL}/alletre/profile/wallet`,
      type: 'account_onboarding',
    });
    console.log('sendOnboardingLink 4 :', accountLink);

    return accountLink.url;
  }

  /**
   * Withdraw funds to a connected account after KYC verification check.
   */
  async withdrawFunds(userId: number, amount: number) {
    const connectedAccount = await this.getOrCreateConnectedAccount(userId);
    const kycStatus = await this.checkKYCStatus(userId);

    if (!kycStatus.isKYCComplete) {
      throw new Error('KYC verification is incomplete. Please complete KYC.');
    }

    const transfer = await this.stripe.transfers.create({
      amount: amount,
      currency: 'aed',
      destination: connectedAccount.id,
      transfer_group: `user_${userId}`,
    });

    const payout = await this.stripe.payouts.create(
      {
        amount: amount,
        currency: 'aed',
        metadata: { userId, transferId: transfer.id },
      },
      { stripeAccount: connectedAccount.id },
    );

    return payout;
  }

  // Helper function to retrieve or create a Stripe connected account for the user
  private async getOrCreateConnectedAccount(userId: number) {
    const user = await this.fetchUserFromDatabase(userId);

    if (user.stripeConnectedAccountId) {
      return await this.stripe.accounts.retrieve(user.stripeConnectedAccountId);
    } else {
      const account = await this.stripe.accounts.create({
        type: 'express',
        country: 'AE',
        business_type: 'individual',
        email: user.email,
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
      });
      await this.saveConnectedAccountIdToDatabase(userId, account.id);
      return account;
    }
  }

  private async fetchUserFromDatabase(userId: number) {
    return await this.prismaService.user.findUnique({
      where: {
        id: userId,
      },
    });
  }

  private async saveConnectedAccountIdToDatabase(
    userId: number,
    stripeConnectedAccountId: string,
  ) {
    await this.prismaService.user.update({
      where: { id: userId },
      data: { stripeConnectedAccountId },
    });
  }
}
