import { Body, Controller, Headers, Post } from '@nestjs/common';
import { PaymentsService } from './services/payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('/webhook-listener')
  async webHookEventListener(
    @Body() body: any,
    @Headers('stripe-signature') stripeSignature: string,
  ) {
    await this.paymentsService.webHookEventHandler(body, stripeSignature);
    return {
      success: true,
    };
  }
}
