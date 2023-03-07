import { Module } from '@nestjs/common';
import { RegionsService } from './regions.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RegionsController } from './regions.controller';

@Module({
  imports: [PrismaModule],
  providers: [RegionsService],
  controllers: [RegionsController],
})
export class RegionsModule {}
