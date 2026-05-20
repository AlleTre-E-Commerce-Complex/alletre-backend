import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Get,
  All,
  RawBodyRequest,
  Req,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
  UploadedFiles,
  Param,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { PaymentsService } from './services/payments.service';
import { Request } from 'express';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { Account } from 'src/auth/decorators/account.decorator';
import { User } from '@prisma/client';

@Controller('payments-v2')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}
  
  @Get('ping')
  async ping() {
    console.log('--- PAYMENTS GET PING REACHED ---');
    return { status: 'ok', method: 'GET', timestamp: new Date().toISOString() };
  }

  @Post('post-ping')
  async postPing() {
    console.log('--- PAYMENTS POST PING REACHED ---');
    return { status: 'ok', method: 'POST', timestamp: new Date().toISOString() };
  }

  @HttpCode(200)
  @Post('sw')
  async webHookEventListener(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') stripeSignature: string,
  ) {
    console.log('--- WEBHOOK CONTROLLER HIT ---');
    // Use rawBody for Stripe signature verification
    const payload = req.rawBody || req.body;
    console.log('Webhook Raw Body Length:', req.rawBody ? req.rawBody.length : 'MISSING');
    console.log('Webhook Body Type:', typeof payload);
    await this.paymentsService.webHookEventHandler(
      payload,
      stripeSignature,
    );
    return {
      success: true,
    };
  }

  @Post('pay-arbon')
  @UseGuards(AuthGuard)
  async payArbon(
    @Account() user: any,
    @Body('productId', ParseIntPipe) productId: number,
    @Body('amount', ParseIntPipe) amount: number,
    @Body('currency') currency: string,
    @Body('isWalletPayment') isWalletPayment: boolean,
    @Req() req: Request,
  ) {
    console.log('--- PAY-ARBON REQUEST RECEIVED ---', {
      allowedOrigins: [
        'https://3arbon.com',
        'https://www.3arbon.com',
        'https://alletre.com',
        'https://www.alletre.com',
        'https://admin.3arbon.com',
      ],
      productId,
      amount,
      userId: user?.id,
      path: req.originalUrl
    });
    const result = await this.paymentsService.payDepositByArbon(
      user,
      productId,
      currency || 'AED',
      amount,
      isWalletPayment
    );
    return {
      success: true,
      data: result,
    };
  }

  @Post('release-arbon')
  @UseGuards(AuthGuard)
  async releaseArbon(
    @Account() user: User,
    @Body('productId', ParseIntPipe) productId: number,
  ) {
    const result = await this.paymentsService.releaseArbonDeposit(user, productId);
    return {
      success: true,
      data: result,
    };
  }

  @Get('deposit-details')
  @UseGuards(AuthGuard)
  async getDepositDetails(@Account() user: User) {
    console.log('GET deposit-details hit for user:', user.id);
    const result = await this.paymentsService.getDepositDetails(user);
    return {
      success: true,
      data: result,
    };
  }

  @Post('objection')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    AnyFilesInterceptor({
      dest: 'uploads/',
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async createObjection(
    @Account() user: User,
    @Body() data: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    const result = await this.paymentsService.createObjection(user, data, files);
    return {
      success: true,
      data: result,
    };
  }

  @Get('objections/:id')
  @UseGuards(AuthGuard)
  async getObjection(@Param('id') id: number) {
    const result = await this.paymentsService.getObjection(id);
    return {
      success: true,
      data: result,
    };
  }

  @Post('objections/:id/reply')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    AnyFilesInterceptor({
      dest: 'uploads/',
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async replyToObjection(
    @Account() user: User,
    @Param('id') id: number,
    @Body() data: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    const result = await this.paymentsService.replyToObjection(user, id, data, files);
    return {
      success: true,
      data: result,
    };
  }
}
