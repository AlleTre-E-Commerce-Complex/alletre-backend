import { Module } from '@nestjs/common';
import { PaymentsService } from './services/payments.service';
import { StripeService } from 'src/common/services/stripe.service';
import { PrismaModule } from 'src/prisma/prisma.module'; 
import { PaymentsController } from './payments.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
