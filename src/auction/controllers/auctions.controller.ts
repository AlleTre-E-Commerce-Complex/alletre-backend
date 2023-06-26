import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { OwnerGuard } from '../../auth/guards/owner.guard';
import { Account } from 'src/auth/decorators/account.decorator';
import { UserAuctionsService } from '../services/user-auctions.service';
import {
  AuctionCreationDTO,
  GetAuctionsByOwnerDTO,
  GetAuctionsDTO,
  GetJoinAuctionsDTO,
  PaginationDTO,
  ProductDTO,
  SubmitBidDTO,
} from '../dtos';
import {
  FileInterceptor,
  FilesInterceptor,
  AnyFilesInterceptor,
} from '@nestjs/platform-express';
import { AuthOrGuestGuard } from 'src/auth/guards/authOrGuest.guard';
import { Role } from 'src/auth/enums/role.enum';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

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

  @Get('/user/main')
  @UseGuards(AuthOrGuestGuard)
  async getMainAuctions(
    @Account() account: any,
    @Query() getAuctionsDTO: GetAuctionsDTO,
  ) {
    const auctionsPaginated =
      await this.userAuctionsService.findAuctionsForUser(
        account.roles,
        getAuctionsDTO,
        account.roles.includes(Role.User) ? Number(account.id) : undefined,
      );

    return {
      success: true,
      pagination: auctionsPaginated.pagination,
      data: auctionsPaginated.auctions,
    };
  }

  @Get('/user/live')
  @UseGuards(AuthOrGuestGuard)
  async getLiveAuctions(
    @Account() account: any,
    @Query() paginationDTO: PaginationDTO,
  ) {
    const auctionsPaginated =
      await this.userAuctionsService.findLiveAuctionsForUser(
        account.roles,
        paginationDTO,
        account.roles.includes(Role.User) ? Number(account.id) : undefined,
      );

    return {
      success: true,
      pagination: auctionsPaginated.pagination,
      data: auctionsPaginated.auctions,
    };
  }

  @Get('/user/buy-now')
  @UseGuards(AuthOrGuestGuard)
  async getBuyNowAuctions(
    @Account() account: any,
    @Query() paginationDTO: PaginationDTO,
  ) {
    const auctionsPaginated =
      await this.userAuctionsService.findBuyNowAuctionsForUser(
        account.roles,
        paginationDTO,
        account.roles.includes(Role.User) ? Number(account.id) : undefined,
      );

    return {
      success: true,
      pagination: auctionsPaginated.pagination,
      data: auctionsPaginated.auctions,
    };
  }

  @Get('/user/up-comming')
  @UseGuards(AuthOrGuestGuard)
  async getUpCommingAuctions(
    @Account() account: any,
    @Query() paginationDTO: PaginationDTO,
  ) {
    const auctionsPaginated =
      await this.userAuctionsService.findUpCommingAuctionsForUser(
        account.roles,
        paginationDTO,
        account.roles.includes(Role.User) ? Number(account.id) : undefined,
      );

    return {
      success: true,
      pagination: auctionsPaginated.pagination,
      data: auctionsPaginated.auctions,
    };
  }

  @Get('/user/similar')
  @UseGuards(AuthOrGuestGuard)
  async getSimilarAuctions(
    @Account() account: any,
    @Query('auctionId', ParseIntPipe) auctionId: number,
  ) {
    const similarAuctionsResult =
      await this.userAuctionsService.findSimilarAuctions(
        Number(auctionId),
        account.roles,
        account.roles.includes(Role.User) ? Number(account.id) : undefined,
      );

    return {
      success: true,
      count: similarAuctionsResult.count,
      data: similarAuctionsResult.similarAuctions,
    };
  }

  @Get('/user/sponsored')
  @UseGuards(AuthOrGuestGuard)
  async getSponseredAuctions(@Account() account: any) {
    const auctions = await this.userAuctionsService.findSponseredAuctions(
      account.roles,
      account.roles.includes(Role.User) ? Number(account.id) : undefined,
    );
    return {
      status: true,
      totalItems: auctions?.length,
      data: auctions,
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

  @Get('/user/joined-auctions')
  @UseGuards(AuthGuard)
  async getJoinedAuctions(
    @Account() account: any,
    @Query() getJoinAuctionsDTO: GetJoinAuctionsDTO,
  ) {
    const userAuctionsPaginated =
      await this.userAuctionsService.getBidderJoindAuctions(
        account.id,
        getJoinAuctionsDTO,
      );

    return {
      success: true,
      pagination: userAuctionsPaginated.pagination,
      data: userAuctionsPaginated.auctions,
    };
  }

  @Get('/user/purchased-auctions')
  @UseGuards(AuthGuard)
  async getPurchasedAuctions(
    @Account() account: any,
    @Query() paginationDTO: PaginationDTO,
  ) {
    const purchasedAuctionsPaginated =
      await this.userAuctionsService.getAllPurchasedAuctions(
        account.id,
        paginationDTO,
      );

    return {
      success: true,
      pagination: purchasedAuctionsPaginated.pagination,
      data: purchasedAuctionsPaginated.auctions,
    };
  }

  @Post('/user/pay')
  @UseGuards(AuthGuard)
  async payForAuction(
    @Account() account: any,
    @Body('auctionId', ParseIntPipe) auctionId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.payToPublish(account.id, auctionId),
    };
  }

  @Get('/user/ownes/analytics')
  @UseGuards(AuthGuard)
  async getAuctionsAnalytics(@Account() account: any) {
    const auctionsAnalytics =
      await this.userAuctionsService.findAuctionsAnalyticsForOwner(account.id);

    return {
      success: true,
      totalItems: auctionsAnalytics.count,
      data: auctionsAnalytics.auctionsGrouping,
    };
  }
  @Get('/user/joined-auctions/analytics')
  @UseGuards(AuthGuard)
  async getJoinedAuctionsAnalytics(@Account() account: any) {
    const auctionsAnalytics =
      await this.userAuctionsService.findJoinedAuctionsAnalytics(account.id);

    return {
      success: true,
      totalItems: auctionsAnalytics.count,
      data: auctionsAnalytics.auctionsGrouping,
    };
  }

  @Get('/admin/all')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async getAllAuctionsByAdmin(
    @Query() getAuctionsByOwnerDTO: GetAuctionsByOwnerDTO,
  ) {
    const auctionsPaginated =
      await this.userAuctionsService.findAuctionsByAdmin(getAuctionsByOwnerDTO);

    return {
      success: true,
      pagination: auctionsPaginated.pagination,
      data: auctionsPaginated.auctions,
    };
  }

  @Get('/user/:auctionId')
  @UseGuards(AuthGuard, OwnerGuard)
  async getOwnesAuctionById(
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.findOwnerAuctionByIdOr404(auctionId),
    };
  }

  @Delete('/user/:auctionId')
  @UseGuards(AuthGuard, OwnerGuard)
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

  @Get('/user/:auctionId/details')
  @UseGuards(AuthOrGuestGuard)
  async getAuctionById(
    @Account() account: any,
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.findAuctionByIdOr404(
        auctionId,
        account.roles,
        account.roles.includes(Role.User) ? Number(account.id) : undefined,
      ),
    };
  }

  @Put('/user/:auctionId/details')
  @UseGuards(AuthGuard, OwnerGuard)
  @UseInterceptors(AnyFilesInterceptor())
  async updateAuctionDetails(
    @Account() account: any,
    @Body() auctionCreationDTO: AuctionCreationDTO,
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.updateAuction(
        auctionId,
        auctionCreationDTO,
        account.id,
      ),
    };
  }

  @Put('/user/:auctionId/draft-details')
  @UseGuards(AuthGuard, OwnerGuard)
  @UseInterceptors(AnyFilesInterceptor())
  async updateAuctionDetailsAsDraft(
    @Body() productDTO: ProductDTO,
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.updateDraftAuction(
        auctionId,
        productDTO,
      ),
    };
  }

  @Delete('/user/:auctionId/remove-image')
  @UseGuards(AuthGuard, OwnerGuard)
  async deleteAuctionPhoto(
    @Param('auctionId', ParseIntPipe) auctionId: number,
    @Query('imageId', ParseIntPipe) imageId: number,
  ) {
    await this.userAuctionsService.deleteAuctionImage(auctionId, imageId);
    return {
      success: true,
    };
  }

  @Patch('/user/:auctionId/upload-image')
  @UseInterceptors(
    FileInterceptor('image', {
      dest: 'uploads/',
    }),
  )
  @UseGuards(AuthGuard, OwnerGuard)
  async addAuctionImage(
    @Param('auctionId', ParseIntPipe) auctionId: number,
    @UploadedFile() image: Express.Multer.File,
  ) {
    await this.userAuctionsService.uploadImageForAuction(auctionId, image);
    return {
      success: true,
    };
  }

  @Post('/user/:auctionId/submit-bid')
  @UseGuards(AuthGuard)
  async submitBidByUser(
    @Account() account: any,
    @Body() submitBidDTO: SubmitBidDTO,
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    await this.userAuctionsService.submitBidForAuction(
      Number(account.id),
      auctionId,
      Number(submitBidDTO.bidAmount),
    );
    return {
      success: true,
    };
  }

  @Post('/user/:auctionId/bidder-deposit')
  @UseGuards(AuthGuard)
  async bidderDeposit(
    @Account() account: any,
    @Body() submitBidDTO: SubmitBidDTO,
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.payDepositByBidder(
        Number(account.id),
        auctionId,
        Number(submitBidDTO.bidAmount),
      ),
    };
  }

  @Post('/user/:auctionId/bidder-purchase')
  @UseGuards(AuthGuard)
  async auctionPurchaseByBidder(
    @Account() account: any,
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.payAuctionByBidder(
        Number(account.id),
        auctionId,
      ),
    };
  }

  @Post('/user/:auctionId/buy-now')
  @UseGuards(AuthGuard)
  async buyNowAuction(
    @Account() account: any,
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.buyNowAuction(
        Number(account.id),
        auctionId,
      ),
    };
  }

  @Post('/user/:auctionId/confirm-delivery')
  @UseGuards(AuthGuard)
  async deliveryConfirmationByBidder(
    @Account() account: any,
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.confirmDelivery(
        Number(account.id),
        auctionId,
      ),
    };
  }

  @Get('/user/:auctionId/total-bids')
  @UseGuards(AuthOrGuestGuard)
  async viewAuctionBides(@Param('auctionId', ParseIntPipe) auctionId: number) {
    return {
      success: true,
      data: await this.userAuctionsService.findAllAuctionBidders(auctionId),
    };
  }

  @Get('/user/:auctionId/bids-history')
  @UseGuards(AuthOrGuestGuard)
  async viewBidsHistoryForUser(
    @Param('auctionId', ParseIntPipe) auctionId: number,
    @Query('userId', ParseIntPipe) userId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.findAuctionBidsHistoryForUser(
        auctionId,
        userId,
      ),
    };
  }
}
