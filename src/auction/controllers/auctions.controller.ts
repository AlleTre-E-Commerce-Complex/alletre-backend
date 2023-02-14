import { Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OwnerGuard } from '../../auth/guards/owner.guard';

@Controller('auctions')
export class AuctionsController {
  constructor() {}

  @Post()
  @UseGuards(AuthGuard)
  async createAuctionController() {}

  @Get('/user')
  @UseGuards(AuthGuard)
  async getAuctions() {}

  @Get('/guest')
  @UseGuards(AuthGuard)
  async getAuctionsForGuest() {}

  @Get('/user/ownes')
  @UseGuards(AuthGuard)
  async getSellerAuctions() {}

  @Get('/user/:auctionId')
  @UseGuards(AuthGuard)
  async getAuctionById() {}

  @Put('/user/:auctionId/update-details')
  @UseGuards(AuthGuard, OwnerGuard)
  async updateAuctionDetails() {}
}
