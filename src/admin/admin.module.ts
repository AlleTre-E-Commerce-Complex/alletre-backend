import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UserModule } from 'src/user/user.module';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { WalletModule } from 'src/wallet/wallet.module';

@Module({
  providers: [AdminService],
  controllers: [AdminController],
  imports: [PrismaModule, UserModule, FirebaseModule, WalletModule],
  exports: [AdminService],
})
export class AdminModule {}
