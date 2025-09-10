import { Module } from '@nestjs/common';
import { EmailSerivce } from './email.service';
import { SendGridEmailService } from './sendGridEmil.service';
import { EmailController } from './email.controller';
import { EmailBatchService } from './email-batch.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  providers: [
    EmailSerivce,
    SendGridEmailService,
    EmailBatchService,
    PrismaService,
  ],
  exports: [EmailSerivce, SendGridEmailService, EmailBatchService],
  controllers: [EmailController],
})
export class EmailModule {}
