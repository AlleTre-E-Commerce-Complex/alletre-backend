import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OwnerGuard } from '../../auth/guards/owner.guard';
import { Account } from 'src/auth/decorators/account.decorator';
import { UserAuctionsService } from '../services/user-auctions.service';

@Controller('auctions')
export class AuctionsController {
  constructor(private userAuctionsService: UserAuctionsService) {}

  @Post()
  @UseGuards(AuthGuard)
  async createAuctionController() {}

  @Get('/user')
  @UseGuards(AuthGuard)
  async getAuctions(
    @Query('page') page: number,
    @Query('perPage') perPage: number,
  ) {
    const auctionsPaginated =
      await this.userAuctionsService.findAuctionsForUser(page, perPage);

    return {
      success: true,
      totalItems: auctionsPaginated.auctionsCount,
      totalPages: auctionsPaginated.totalPages,
      data: auctionsPaginated.auctions,
    };
  }

  @Get('/guest')
  @UseGuards(AuthGuard)
  async getAuctionsForGuest(
    @Query('page') page: number,
    @Query('perPage') perPage: number,
  ) {
    const auctionsPaginated =
      await this.userAuctionsService.findAuctionsForGuest(page, perPage);

    return {
      success: true,
      totalItems: auctionsPaginated.auctionsCount,
      totalPages: auctionsPaginated.totalPages,
      data: auctionsPaginated.auctions,
    };
  }

  @Get('/user/ownes')
  @UseGuards(AuthGuard)
  async getSellerAuctions(
    @Account() account: any,
    @Query('page') page: number,
    @Query('perPage') perPage: number,
  ) {
    const userAuctionsPaginated =
      await this.userAuctionsService.findUserOwnesAuctions(
        account.id,
        page,
        perPage,
      );

    return {
      success: true,
      totalItems: userAuctionsPaginated.userOwensAuctionsCount,
      totalPages: userAuctionsPaginated.totalPages,
      data: userAuctionsPaginated.userAuctions,
    };
  }

  @Get('/user/:auctionId')
  @UseGuards(AuthGuard)
  async getAuctionById(@Param('auctionId', ParseIntPipe) auctionId: number) {
    return {
      success: true,
      data: await this.userAuctionsService.findAuctionById(auctionId),
    };
  }

  @Put('/user/:auctionId/update-details')
  @UseGuards(AuthGuard, OwnerGuard)
  async updateAuctionDetails() {}
}
