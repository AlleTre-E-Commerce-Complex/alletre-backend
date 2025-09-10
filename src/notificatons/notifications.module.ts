import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsController } from './notifications.controller';
import { NotificationGateway } from './notifications.gateway';
import { UserModule } from 'src/user/user.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [PrismaModule, UserModule, HttpModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PrismaService, NotificationGateway],
  exports: [NotificationsService, NotificationGateway, HttpModule],
})
export class NotificationsModule {}
