import { Controller, Post, Body, HttpCode, RawBodyRequest, Headers, Req, Res, Query } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { Request, Response } from 'express';

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
      messages: any;
      mediaUrl?: string;
      buttonUrl?: string;
      limit?: string,
      skip? : string, 
      categoryId? : string,
    }
  ) {
    console.log('category Id :',body.categoryId)
    return this.whatsappService.sendCommonMessageToUsers(
      body.messages,
      'NON_EXISTING_USER',
      body.mediaUrl,
      body.buttonUrl,
      Number(body.limit),
      Number(body.skip), 
      Number(body.categoryId),
    );
  }

  @HttpCode(200)
  @Post('/whatsapp-webhook-listener') 
  async whatsAppWebhookEventListener(
    @Req() req: Request,
    @Res() res: Response,
    @Headers() headers : any,
    @Query() query : any,
  ) {
    console.log('🔹 Webhook Received');
    console.log('🔹 Headers:', headers);
    console.log('🔹 Query Params:', query);
    console.log('🔹 Raw Body:', req.body); // This will now work
    // console.log('🔹 Raw Body:', req.body.entry[0].changes); // This will now work

    // Gupshup expects a quick 200 OK response
    res.status(200).send();
  }
  
}
