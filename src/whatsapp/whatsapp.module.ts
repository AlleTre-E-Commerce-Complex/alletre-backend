import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { UserService } from 'src/user/user.service';
import { FirebaseService } from 'src/firebase/firebase.service';
import { WalletService } from 'src/wallet/wallet.service';
import { PaginationService } from 'src/common/services/pagination.service';
import { EmailSerivce } from 'src/emails/email.service';
import { EmailBatchService } from 'src/emails/email-batch.service';

@Module({
  imports: [PrismaModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService,UserService,FirebaseService,WalletService,PaginationService,EmailSerivce,EmailBatchService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
