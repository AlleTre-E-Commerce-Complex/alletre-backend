import { Module } from '@nestjs/common';
import { WatchListController } from './controllers/watch-list.controller';
import { WatchListService } from './services/watch-list.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [PrismaModule, UserModule],
  controllers: [WatchListController],
  providers: [WatchListService],
})
export class WatchListModule {}
