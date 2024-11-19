import { Module } from '@nestjs/common';
import { EmailSerivce } from './email.service';
import { SendGridEmailService } from './sendGridEmil.service';

@Module({
  providers: [EmailSerivce, SendGridEmailService],
  exports: [EmailSerivce, SendGridEmailService],
})
export class EmailModule {}
