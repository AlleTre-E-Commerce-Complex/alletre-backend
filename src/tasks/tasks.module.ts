import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { AuctionModule } from 'src/auction/auction.module';

@Module({
  imports: [AuctionModule],
  providers: [TasksService],
})
export class TasksModule {}
