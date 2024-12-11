import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuctionModule } from 'src/auction/auction.module';
import { PaymentsService } from 'src/payments/services/payments.service';
import { StripeService } from 'src/common/services/stripe.service';
import { WalletService } from 'src/wallet/wallet.service';
import { EmailSerivce } from 'src/emails/email.service';
import { EmailBatchService } from 'src/emails/email-batch.service';
import { NotificationsService } from 'src/notificatons/notifications.service';
import { NotificationsModule } from 'src/notificatons/notifications.module';

@Module({
  imports: [PrismaModule, AuctionModule, NotificationsModule],
  providers: [
    TasksService,
    PaymentsService,
    StripeService,
    WalletService,
    EmailSerivce,
    EmailBatchService,
    NotificationsService,
  ],
})
export class TasksModule {}
