// src/app-version/app-version.module.ts
import { Module } from '@nestjs/common';
import { AppVersionService } from './version.service';
import { AppVersionController } from './version.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [UserModule],
  controllers: [AppVersionController],
  providers: [AppVersionService, PrismaService],
  exports: [AppVersionService],
})
export class AppVersionModule {}
