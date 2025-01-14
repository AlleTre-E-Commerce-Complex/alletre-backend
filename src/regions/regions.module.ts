import { Module } from '@nestjs/common';
import { RegionsService } from './regions.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RegionsController } from './regions.controller';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [PrismaModule, UserModule],
  providers: [RegionsService],
  controllers: [RegionsController],
})
export class RegionsModule {}
