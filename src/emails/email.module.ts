import { Module } from '@nestjs/common';
import { EmailSerivce } from './email.service';

@Module({
  providers: [EmailSerivce],
  exports: [EmailSerivce],
})
export class EmailModule {}
