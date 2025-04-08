import { Module } from '@nestjs/common';
import { UserAuctionsService } from './services/user-auctions.service';
import { PaginationService } from '../common/services/pagination.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { AuctionsController } from './controllers/auctions.controller';
import { AuctionsHelper } from './helpers/auctions-helper';
import { BidsWebSocketGateway } from './gateway/bids.gateway';
import { AuthModule } from 'src/auth/auth.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { AuctionStatusValidator } from './validations/auction-validator';
import { WalletService } from 'src/wallet/wallet.service';
import { StripeService } from 'src/common/services/stripe.service';
import { EmailSerivce } from 'src/emails/email.service';
import { NotificationsService } from 'src/notificatons/notifications.service';
import { NotificationsModule } from 'src/notificatons/notifications.module';
import { AuctionWebSocketGateway } from './gateway/auction.gateway';
import { UserModule } from 'src/user/user.module';
import { WhatsAppModule } from 'src/whatsapp/whatsapp.module';

@Module({
  imports: [
    PrismaModule,
    FirebaseModule,
    AuthModule,
    PaymentsModule,
    NotificationsModule,
    UserModule,
    WhatsAppModule,
  ],
  providers: [
    UserAuctionsService,
    PaginationService,
    AuctionsHelper,
    BidsWebSocketGateway,
    AuctionWebSocketGateway,
    AuctionStatusValidator,
    WalletService,
    StripeService,
    EmailSerivce,
    NotificationsService,
  ],
  controllers: [AuctionsController],
  exports: [UserAuctionsService, AuctionWebSocketGateway],
})
export class AuctionModule {
  constructor() {
    console.log('test auxtion module');
  }
}
