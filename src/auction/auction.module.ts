import { Module } from '@nestjs/common';
import { UserAuctionsService } from './services/user-auctions.service';

@Module({
  providers: [UserAuctionsService],
})
export class AuctionModule {}
