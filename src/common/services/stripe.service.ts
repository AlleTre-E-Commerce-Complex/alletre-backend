import { Injectable, MethodNotAllowedException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import Stripe from 'stripe';
import { MethodNotAllowedResponse } from '../errors';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor() {
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
    let event = payload;

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
    console.log(`Unhandled event type ${event.type}`);

    // Handle the event
    switch (event.type) {
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
        return {
          status: PaymentStatus.FAILED,
          paymentIntent,
        };
      case 'payment_intent.created':
        const createdPaymentIntent = event.data.object;
        console.log(
          `PaymentIntent for ${createdPaymentIntent.amount} was created!`,
        );
        break;
      default:
        // Unexpected event type
        console.log(`Unhandled event type ${event.type}.`);
    }
  }
}
