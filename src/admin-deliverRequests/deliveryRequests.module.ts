import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { DeliveryRequestController } from './deliveryRequests.controller';
import { DeliveryRequestService } from './deliveryRequests.service';
import { UserModule } from 'src/user/user.module';
import { AuctionModule } from 'src/auction/auction.module';

@Module({
  imports: [PrismaModule, UserModule, AuctionModule],
  controllers: [DeliveryRequestController],
  providers: [DeliveryRequestService],
})
export class DeliveryRequestModule {}
