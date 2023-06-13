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

@Module({
  imports: [PrismaModule, FirebaseModule, AuthModule, PaymentsModule],
  providers: [
    UserAuctionsService,
    PaginationService,
    AuctionsHelper,
    BidsWebSocketGateway,
    AuctionStatusValidator,
  ],
  controllers: [AuctionsController],
  exports: [UserAuctionsService],
})
export class AuctionModule {}
