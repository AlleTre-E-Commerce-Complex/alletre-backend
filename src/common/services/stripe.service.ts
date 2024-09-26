
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

  let paymentIntent: any;
  try {
    paymentIntent = await this.stripe.paymentIntents.create({
      customer: stripeCustomerId,
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
    throw new MethodNotAllowedResponse({
      ar: 'قيمة عملية الدفع غير صالحة',
      en: 'Invalid Payment Amount',
    });
  }
  console.log('Create Deposite Payment Intent---->',paymentIntent)

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

// Add a method to capture the authorized payment
async captureDepositPaymentIntent(paymentIntentId: string) {
  try {
    console.log('captureDepositPaymentIntent: -->',paymentIntentId)

    const capturedPaymentIntent = await this.stripe.paymentIntents.capture(paymentIntentId);
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
    console.log('cancelDepositPaymentIntent: -->',paymentIntentId)
    const canceledIntent = await this.stripe.paymentIntents.cancel(paymentIntentId);
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
//we can use--->   "payment_intent.amount_capturable_updated"   <---event of web hook for handling the HOLD method of stripe

    let event = payload;
    console.log('payload=>',payload,'stripeSignature==>',stripeSignature)
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
        return {
          status: PaymentStatus.HOLD,
          paymentIntent:holdPaymentIntent,
        };
        case 'payment_intent.canceled':
          const cancelPaymentIntent = event.data.object
          console.log(
            `PaymentIntent for ${cancelPaymentIntent.amount} was Cancelled!`,
          );
          return {
            status:PaymentStatus.CANCELLED,
            paymentIntent:cancelPaymentIntent
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
        return {
          status: PaymentStatus.FAILED,
          paymentIntent: failedPaymentIntent,
        };

      default:
        // Unexpected event type
        console.log(`Unhandled event type ${event.type}.`);
    }
  }
}
