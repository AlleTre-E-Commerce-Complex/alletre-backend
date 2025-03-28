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
    return this.whatsappService.sendAuctionToUsers(body.auctionId,'EXISTING_USER')
  }
  @Post('send-auction-bulk-ToNonExistingUser')
  async sendAuctionToNonExistingBulkUsers(@Body() body :{auctionId : string}) {
    return this.whatsappService.sendAuctionToUsers(body.auctionId, 'NON_EXISTING_USER'
      
    )
  }
  @Post('send-commentMessage-ToNonExistingUser')
  async sendCommonMessageToAllNonExistingUsers(
    @Body() body: {
      message: string;
      mediaUrl?: string;
      buttonUrl?: string;
    }
  ) {
    return this.whatsappService.sendCommonMessageToUsers(
      body.message,
      'NON_EXISTING_USER',
      body.mediaUrl,
      body.buttonUrl
    );
  }
}
