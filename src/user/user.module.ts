import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserController } from './user.controller';

@Module({
  imports: [PrismaService],
  providers: [UserService],
  exports: [UserService],
  controllers: [UserController],
})
export class UserModule {}
