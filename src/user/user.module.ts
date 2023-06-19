import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { PaginationService } from 'src/common/services/pagination.service';

@Module({
  imports: [PrismaModule, FirebaseModule],
  providers: [UserService, PaginationService],
  exports: [UserService],
  controllers: [UserController],
})
export class UserModule {}
