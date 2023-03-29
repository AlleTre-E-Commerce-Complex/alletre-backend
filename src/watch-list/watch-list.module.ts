import { Module } from '@nestjs/common';
import { WatchListController } from './controllers/watch-list.controller';
import { WatchListService } from './services/watch-list.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WatchListController],
  providers: [WatchListService],
})
export class WatchListModule {}
