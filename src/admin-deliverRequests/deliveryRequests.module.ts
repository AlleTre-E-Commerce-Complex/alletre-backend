import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { DeliveryRequestController } from './deliveryRequests.controller';
import { DeliveryRequestService } from './deliveryRequests.service';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [PrismaModule, UserModule],
  controllers: [DeliveryRequestController],
  providers: [DeliveryRequestService],
})
export class DeliveryRequestModule {}
