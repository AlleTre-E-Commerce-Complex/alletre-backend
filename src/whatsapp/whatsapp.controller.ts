import {
  Controller,
  Post,
  Body,
  HttpCode,
  RawBodyRequest,
  Headers,
  Req,
  Res,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { Request, Response } from 'express';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { Account } from 'src/auth/decorators/account.decorator';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Post('send')
  async sendMessage(@Body() body: { phone: string; message: string }) {
    console.log('body--->', body);
    return this.whatsappService.sendMessage(body.phone, body.message);
  }

  @Post('send-auction-bulk')
  async sendAuctionToBulkUsers(@Body() body: { auctionId: string }) {
    return this.whatsappService.sendAuctionToUsers(
      body.auctionId,
      'EXISTING_USER',
    );
  }
  @Post('send-auction-bulk-ToNonExistingUser')
  async sendAuctionToNonExistingBulkUsers(@Body() body: { auctionId: string }) {
    return this.whatsappService.sendAuctionToUsers(
      body.auctionId,
      'NON_EXISTING_USER',
    );
  }
  @Post('Send-Inspection-Details')
    @UseGuards(AuthGuard)
  async SendInspectionDetails(
    @Account() account: any,
    @Query('auctionId') auctionId:string) {
      console.log('Account--',account)
      console.log('auctionId',auctionId)
    return this.whatsappService.SendInspectionDetails(
      account.id,
      auctionId,
      account.phone,
    );
  }
  @Post('send-commentMessage-ToNonExistingUser')
  async sendCommonMessageToAllNonExistingUsers(
    @Body()
    body: {
      messages: any;
      mediaUrl?: string;
      buttonUrl?: string;
      limit?: string;
      skip?: string;
      categoryId?: string;
    },
  ) {
    console.log('category Id :', body.categoryId);
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
    @Headers() headers: any,
    @Query() query: any,
  ) {
    console.log('🔹 Webhook Received');
    console.log('🔹 Headers:', headers);
    console.log('🔹 Query Params:', query);
    console.log('🔹 Raw Body:', req.body); // This will now work
    // console.log('🔹 Raw Body:', req.body.entry[0].changes); // This will now work
    const response = await this.whatsappService.handleWhatsAppWhebhook(
      req.body,
    );
    // Gupshup expects a quick 200 OK response
    if (response?.reply) {
      res.status(200).send(response?.reply);
    } else {
      res.status(200).send();
    }
  }
}
