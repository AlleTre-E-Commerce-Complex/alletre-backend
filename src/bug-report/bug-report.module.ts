import { Module } from '@nestjs/common';
import { BugReportController } from './bug-report.controller';
import { BugReportService } from './bug-report.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { UserModule } from '../user/user.module';
import { NotificationsModule } from '../notificatons/notifications.module';

@Module({
  imports: [PrismaModule, FirebaseModule, UserModule, NotificationsModule],
  controllers: [BugReportController],
  providers: [BugReportService],
  exports: [BugReportService],
})
export class BugReportModule {}
