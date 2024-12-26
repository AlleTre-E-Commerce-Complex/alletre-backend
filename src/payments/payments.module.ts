import { Module } from '@nestjs/common';
import { PaymentsService } from './services/payments.service';
import { StripeService } from 'src/common/services/stripe.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PaymentsController } from './payments.controller';
import { EmailSerivce } from 'src/emails/email.service';
import { WalletService } from 'src/wallet/wallet.service';
import { EmailBatchService } from 'src/emails/email-batch.service';
import { NotificationsService } from 'src/notificatons/notifications.service';
import { NotificationsModule } from 'src/notificatons/notifications.module';
import { AuctionWebSocketGateway } from 'src/auction/gateway/auction.gateway';
import { AuthService } from 'src/auth/auth.service';
import { UserService } from 'src/user/user.service';
import { JwtService } from '@nestjs/jwt';
import { FirebaseService } from 'src/firebase/firebase.service';
import { AdminService } from 'src/admin/admin.service';
import { PaginationService } from 'src/common/services/pagination.service';
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    StripeService,
    EmailSerivce,
    WalletService,
    EmailBatchService,
    NotificationsService,
    AuctionWebSocketGateway,
    AuthService,
    UserService,
    JwtService,
    FirebaseService,
    AdminService,
    PaginationService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
