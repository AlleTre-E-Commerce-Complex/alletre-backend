import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from '../user/user.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { EmailModule } from '../emails/email.module';
import { AdminModule } from 'src/admin/admin.module';
import { WalletService } from 'src/wallet/wallet.service';
import { WalletModule } from 'src/wallet/wallet.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    UserModule,
    FirebaseModule,
    EmailModule,
    AdminModule,
    WalletModule,
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
