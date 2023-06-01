import {
  Body,
  Controller,
  Headers,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { PaymentsService } from './services/payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

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
