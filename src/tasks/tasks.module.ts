import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuctionModule } from 'src/auction/auction.module';
import { PaymentsService } from 'src/payments/services/payments.service';
import { StripeService } from 'src/common/services/stripe.service';
import { WalletService } from 'src/wallet/wallet.service';
import { EmailSerivce } from 'src/emails/email.service';
import { EmailBatchService } from 'src/emails/email-batch.service';

@Module({
  imports: [PrismaModule, AuctionModule],
  providers: [
    TasksService,
    PaymentsService,
    StripeService,
    WalletService,
    EmailSerivce,
    EmailBatchService,
  ],
})
export class TasksModule {}
