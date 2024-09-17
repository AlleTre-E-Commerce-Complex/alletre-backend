import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { PaymentsService } from './services/payments.service';
import { Request } from 'express';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @HttpCode(200)
  @Post('/webhook-listener')
  async webHookEventListener(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') stripeSignature: string,
  ) {
    await this.paymentsService.webHookEventHandler(
      req.rawBody,
      stripeSignature,
    );
    return {
      success: true,
    };
  }
}
