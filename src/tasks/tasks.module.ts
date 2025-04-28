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
import { AdminWebSocketGateway } from 'src/auction/gateway/admin.gateway';
import { AuthService } from 'src/auth/auth.service';
import { UserService } from 'src/user/user.service';
import { JwtService } from '@nestjs/jwt';
import { FirebaseService } from 'src/firebase/firebase.service';
import { AdminService } from 'src/admin/admin.service';
import { PaginationService } from 'src/common/services/pagination.service';
import { WhatsAppService } from 'src/whatsapp/whatsapp.service';
import { BidsWebSocketGateway } from 'src/auction/gateway/bids.gateway';

@Module({
  imports: [PrismaModule, AuctionModule, NotificationsModule],
  providers: [
    TasksService,
    PaymentsService,
    WhatsAppService,
    StripeService,
    WalletService,
    EmailSerivce,
    EmailBatchService,
    NotificationsService,
    AdminWebSocketGateway,
    AuthService,
    UserService,
    JwtService,
    FirebaseService,
    AdminService,
    PaginationService,
    BidsWebSocketGateway,
  ],
})
export class TasksModule {}
