import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuctionModule } from 'src/auction/auction.module';

@Module({
  imports: [PrismaModule, AuctionModule],
  providers: [TasksService],
})
export class TasksModule {}
