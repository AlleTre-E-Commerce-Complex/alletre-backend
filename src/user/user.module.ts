import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { PaginationService } from 'src/common/services/pagination.service';
import { WalletService } from 'src/wallet/wallet.service';
import { EmailSerivce } from 'src/emails/email.service';
import { AuctionModule } from 'src/auction/auction.module';
import { WhatsAppModule } from 'src/whatsapp/whatsapp.module';

@Module({
  imports: [PrismaModule, FirebaseModule, WhatsAppModule],
  providers: [UserService, PaginationService, WalletService, EmailSerivce],
  exports: [UserService],
  controllers: [UserController],
})
export class UserModule {}
