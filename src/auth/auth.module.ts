import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from '../user/user.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), UserModule],
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
