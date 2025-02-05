import { Controller, Post, Body } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Post('send')
  async sendMessage(@Body() body: { phone: string; message: string }) {
    console.log('body--->',body)
    return this.whatsappService.sendMessage(body.phone, body.message);
  }

  @Post('send-auction-bulk')
  async sendAuctionToBulkUsers(@Body() body :{auctionId : string}) {
    return this.whatsappService.sendAuctionToUsers(body.auctionId)
  }
}
