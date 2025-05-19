import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { FirebaseModule } from './firebase/firebase.module';
import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './emails/email.module';
import { AuctionModule } from './auction/auction.module';
import { CategoryModule } from './category/category.module';
import { LoggerModule } from 'nestjs-pino';
import { RegionsModule } from './regions/regions.module';
import { WatchListModule } from './watch-list/watch-list.module';
import { TasksModule } from './tasks/tasks.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsModule } from './payments/payments.module';
import { AdminModule } from './admin/admin.module';
import { WalletModule } from './wallet/wallet.module';
import { NotificationsModule } from './notificatons/notifications.module';
import { DeliveryRequestModule } from './admin-deliverRequests/deliveryRequests.module';
import { WithdrawalModule } from './withdrawal-requests/withdrawal.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        customProps: (req, res) => {
          return {
            req: {
              ...req,
              headers: undefined,
            },
          };
        },
        transport: {
          target: 'pino-pretty',
        },
      },
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UserModule,
    FirebaseModule,
    PrismaModule,
    EmailModule,
    AuctionModule,
    CategoryModule,
    RegionsModule,
    WatchListModule,
    TasksModule,
    PaymentsModule,
    AdminModule,
    WalletModule,
    NotificationsModule,
    WithdrawalModule,
    DeliveryRequestModule,
    WhatsAppModule,
    DashboardModule,
  ],
})
export class AppModule {
  constructor() {
    console.log('AppModule initialized');
  }
}
