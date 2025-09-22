import { Controller, Post, Body } from '@nestjs/common';

import { Request, Response } from 'express';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { Account } from 'src/auth/decorators/account.decorator';
import { EmailSerivce } from './email.service';

@Controller('emails')
export class EmailController {
  constructor(private readonly emailService: EmailSerivce) {}

  @Post('send-auction-bulk-email')
  async sendAuctionToBulkUsers(@Body() body: { auctionId: string }) {
    return this.emailService.sendAuctionBulkEmail(body.auctionId);
  }

  @Post('send-listedProduct-bulk-email')
  async sendListedProductToBulkUsers(@Body() body: { ListedId: string }) {
    return this.emailService.sendListedProductBulkEmail(body.ListedId);
  }

  @Post('unsubscribe-emails')
  async unsubscribeEmails() {
    return this.emailService.unsubscribeEmais('');
  }
}
