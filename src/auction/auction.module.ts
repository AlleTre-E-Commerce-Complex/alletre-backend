import { Module } from '@nestjs/common';
import { UserAuctionsService } from './services/user-auctions.service';
import { PaginationService } from '../common/services/pagination.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { AuctionsController } from './controllers/auctions.controller';
import { AuctionsHelper } from './helpers/auctions-helper';

@Module({
  imports: [PrismaModule, FirebaseModule],
  providers: [UserAuctionsService, PaginationService, AuctionsHelper],
  controllers: [AuctionsController],
})
export class AuctionModule {}
