import { Module } from '@nestjs/common';
import { PaymentsService } from './services/payments.service';
import { StripeService } from 'src/common/services/stripe.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PaymentsController } from './payments.controller';
import { EmailSerivce } from 'src/emails/email.service';
import { WalletService } from 'src/wallet/wallet.service';
import { EmailBatchService } from 'src/emails/email-batch.service';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    StripeService,
    EmailSerivce,
    WalletService,
    EmailBatchService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
