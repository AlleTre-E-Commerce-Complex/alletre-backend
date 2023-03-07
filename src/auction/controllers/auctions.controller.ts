import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OwnerGuard } from '../../auth/guards/owner.guard';
import { Account } from 'src/auth/decorators/account.decorator';
import { UserAuctionsService } from '../services/user-auctions.service';
import {
  AuctionCreationDTO,
  GetAuctionsByOwnerDTO,
  GetAuctionsDTO,
  ProductDTO,
} from '../dtos';
import { FilesInterceptor } from '@nestjs/platform-express';

@Controller('auctions')
export class AuctionsController {
  constructor(private userAuctionsService: UserAuctionsService) {}

  @Post('')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      dest: 'uploads/',
    }),
  )
  async publishAuctionController(
    @Account() account: any,
    @Body() auctionCreationDTO: AuctionCreationDTO,
    @UploadedFiles() images: Array<Express.Multer.File>,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.createPendingAuction(
        account.id,
        auctionCreationDTO,
        images,
      ),
    };
  }

  @Post('save-draft')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      dest: 'uploads/',
    }),
  )
  async saveAuctionAsDraftController(
    @Account() account: any,
    @Body() productDTO: ProductDTO,
    @UploadedFiles() images: Array<Express.Multer.File>,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.createDraftAuction(
        account.id,
        productDTO,
        images,
      ),
    };
  }

  @Get('/user')
  @UseGuards(AuthGuard)
  async getAuctions(@Query() getAuctionsDTO: GetAuctionsDTO) {
    const auctionsPaginated =
      await this.userAuctionsService.findAuctionsForUser(getAuctionsDTO);

    return {
      success: true,
      pagination: auctionsPaginated.pagination,
      data: auctionsPaginated.auctions,
    };
  }

  @Get('/guest')
  async getAuctionsForGuest(@Query() getAuctionsDTO: GetAuctionsDTO) {
    const auctionsPaginated =
      await this.userAuctionsService.findAuctionsForGuest(getAuctionsDTO);

    return {
      success: true,
      pagination: auctionsPaginated.pagination,
      data: auctionsPaginated.auctions,
    };
  }

  @Get('/user/ownes')
  @UseGuards(AuthGuard)
  async getAuctionsByOwner(
    @Account() account: any,
    @Query() getAuctionsByOwnerDTO: GetAuctionsByOwnerDTO,
  ) {
    const userAuctionsPaginated =
      await this.userAuctionsService.findUserOwnesAuctions(
        account.id,
        getAuctionsByOwnerDTO,
      );

    return {
      success: true,
      pagination: userAuctionsPaginated.pagination,
      data: userAuctionsPaginated.userAuctions,
    };
  }

  @Get('/user/:auctionId')
  @UseGuards(AuthGuard)
  async getAuctionById(@Param('auctionId', ParseIntPipe) auctionId: number) {
    return {
      success: true,
      data: await this.userAuctionsService.findAuctionByIdOr404(auctionId),
    };
  }

  @Delete('/user/:auctionId')
  @UseGuards(AuthGuard)
  async deleteAuctionByOwnerController(
    @Account() account: any,
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.deleteDraftedAuction(
        Number(account.id),
        auctionId,
      ),
    };
  }

  @Put('/user/:auctionId/update-details')
  @UseGuards(AuthGuard, OwnerGuard)
  async updateAuctionDetails() {}

  @Post('/user/:auctionId/make-bid')
  @UseGuards(AuthGuard)
  async makeBidByUser() {}

  @Get('/user/:auctionId/view-bides')
  @UseGuards(AuthGuard)
  async viewAuctionBides() {}
}
