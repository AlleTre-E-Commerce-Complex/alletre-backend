import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { DeliveryRequestController } from './deliveryRequests.controller';
import { DeliveryRequestService } from './deliveryRequests.service';

@Module({
  imports: [PrismaModule],
  controllers: [DeliveryRequestController],
  providers: [DeliveryRequestService],
})
export class DeliveryRequestModule {}
