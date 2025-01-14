import { Module } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [PrismaModule, FirebaseModule, UserModule],
  providers: [CategoryService],
  controllers: [CategoryController],
})
export class CategoryModule {}
