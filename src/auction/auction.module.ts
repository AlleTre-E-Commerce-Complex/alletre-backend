import { Module } from '@nestjs/common';
import { UserAuctionsService } from './services/user-auctions.service';
import { PaginationService } from '../common/services/pagination.service';

@Module({
  providers: [UserAuctionsService, PaginationService],
})
export class AuctionModule {}
