import { Module } from '@nestjs/common';
import { UserAuctionsService } from './services/user-auctions.service';
import { PaginationService } from '../common/services/pagination.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [UserAuctionsService, PaginationService],
})
export class AuctionModule {}
