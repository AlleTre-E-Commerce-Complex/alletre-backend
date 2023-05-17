import { Module } from '@nestjs/common';
import { UserAuctionsService } from './services/user-auctions.service';
import { PaginationService } from '../common/services/pagination.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { AuctionsController } from './controllers/auctions.controller';
import { AuctionsHelper } from './helpers/auctions-helper';
import { BidsWebSocketGateway } from './gateway/bids.gateway';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [PrismaModule, FirebaseModule, AuthModule],
  providers: [
    UserAuctionsService,
    PaginationService,
    AuctionsHelper,
    BidsWebSocketGateway,
  ],
  controllers: [AuctionsController],
  exports: [UserAuctionsService],
})
export class AuctionModule {}
