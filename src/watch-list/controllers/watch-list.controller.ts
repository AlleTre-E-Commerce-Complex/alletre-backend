import {
  Body,
  Controller,
  Delete,
  Get,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Account } from 'src/auth/decorators/account.decorator';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { WatchListService } from '../services/watch-list.service';

@Controller('watch-lists')
export class WatchListController {
  constructor(private watchListService: WatchListService) {}

  @Post('save')
  @UseGuards(AuthGuard)
  async addToWatchList(
    @Account() account: any,
    @Body('auctionId') auctionId?: number,
    @Body('productId') productId?: number,
  ) {
    await this.watchListService.addToWatchList(
      Number(account.id),
      auctionId ? Number(auctionId) : undefined,
      productId ? Number(productId) : undefined,
    );
    return {
      success: true,
      message: 'Saved To WatchList Successfully',
    };
  }

  @Delete('un-save')
  @UseGuards(AuthGuard)
  async deleteFromWatchList(
    @Account() account: any,
    @Query('auctionId') auctionId?: number,
    @Query('productId') productId?: number,
  ) {
    await this.watchListService.removeFromWatchList(
      Number(account.id),
      auctionId ? Number(auctionId) : undefined,
      productId ? Number(productId) : undefined,
    );
    return {
      success: true,
      message: 'Removed From WatchList Successfully',
    };
  }

  @Get('saved')
  @UseGuards(AuthGuard)
  async getAllSavedWatchList(@Account() account: any) {
    return {
      success: true,
      data: await this.watchListService.findAllWatchList(Number(account.id)),
    };
  }
}
