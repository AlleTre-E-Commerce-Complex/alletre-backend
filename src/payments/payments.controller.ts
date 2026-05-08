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

  @HttpCode(200)
  @Post('sw')
  async webHookEventListener(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') stripeSignature: string,
  ) {
    await this.paymentsService.webHookEventHandler(
      req.body,
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
  ) {
    const result = await this.paymentsService.payDepositByArbon(
      user,
      productId,
      currency || 'AED',
      amount,
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
}
