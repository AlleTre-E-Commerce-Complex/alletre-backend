import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { PaginationService } from 'src/common/services/pagination.service';
import { WalletService } from 'src/wallet/wallet.service';

@Module({
  imports: [PrismaModule, FirebaseModule],
  providers: [UserService, PaginationService, WalletService],
  exports: [UserService],
  controllers: [UserController],
})
export class UserModule {}
