import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

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
  ) {
    const paymentIntent = await this.stripe.paymentIntents.create({
      customer: stripeCustomerId,
      amount: amount,
      currency: currency,
      setup_future_usage: 'off_session',
      automatic_payment_methods: {
        enabled: true,
      },
    });
    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
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
}
