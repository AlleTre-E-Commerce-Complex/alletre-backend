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
  GetAuctionsByOtherUserDTO,
  GetAuctionsByOwnerDTO,
  GetAuctionsDTO,
  GetJoinAuctionsDTO,
  GetListedProductByOhterUserDTO,
  PaginationDTO,
  ProductDTO,
  SubmitBidDTO,
  AuctionUpdateDTO,
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
import { AuctionComplaintsDTO } from '../dtos/auctionComplaints.dto';
import { WalletPayDto } from '../dtos/walletPay.dto';
import {
  ListedProductsStatus,
  PaymentStatus,
  PaymentType,
} from '@prisma/client';
import { addNewBankAccountDto } from '../dtos/addNewBankAccount.dto';
import { DeliveryTypeDTO } from '../dtos/DeliveryType.dto';
import { GetListedProductDTO } from '../dtos/getListedProducts.dto';

@Controller('auctions')
export class AuctionsController {
  constructor(private userAuctionsService: UserAuctionsService) {
    console.log('Auction called ... ');
  }

  @Post('')
  @UseGuards(AuthGuard)
  // @UseInterceptors(
  //   FilesInterceptor('images', 5, {
  //     dest: 'uploads/',
  //   }),
  // )
  @UseInterceptors(AnyFilesInterceptor({ dest: 'uploads/' }))
  async publishAuctionController(
    @Account() account: any,
    @Body() auctionCreationDTO: AuctionCreationDTO,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    console.log('The form data of the publish auction :', auctionCreationDTO);
    console.log('The form data of the publish auction :', auctionCreationDTO.product);
    console.log('The files of the publish auction :', files);

    return {
      success: true,
      data: await this.userAuctionsService.createPendingAuction(
        account.id,
        auctionCreationDTO,
        files,
      ),
    };
  }

  @Post('one-click-auction')
  // @UseGuards(AuthGuard)
  async createOneClickAuction(@Account() account: any) {
    const auctionCreationDTO: AuctionCreationDTO = {
      product: {
        title: 'Apple iPhone 16 Pro Max',
        categoryId: 1,
        subCategoryId: 1,
        brand: 'Apple',
        usageStatus: 'NEW',
        model: 'iPhone 16 Pro Max',
        description: 'Brand new iPhone 16 Pro Max for auction',
        
        // Optional fields filled with undefined/defaults
        color: undefined,
        screenSize: undefined,
        processor: undefined,
        operatingSystem: undefined,
        releaseYear: undefined,
        regionOfManufacture: undefined,
        ramSize: undefined,
        cameraType: undefined,
        material: undefined,
        memory: undefined,
        age: undefined,
        totalArea: undefined,
        numberOfRooms: undefined,
        numberOfFloors: undefined,
        landType: undefined,
        countryId: undefined,
        cityId: undefined,
        isOffer: false,
        offerAmount: undefined,
        ProductListingPrice: undefined,
        locationId: undefined,
      },
      startBidAmount: 500,
      type: 'ON_TIME', // Make sure this matches an enum value in AuctionType
      durationUnit: 'HOURS', // Make sure this matches an enum value in DurationUnits
      durationInHours: 1,
      durationInDays: 0,
      locationId: 5,
      
      // Required properties based on DTO
      isBuyNowAllowed: 'YES', // This needs to be 'YES' string, not a boolean
      acceptedAmount: 0,
      startDate: new Date(),
      
      // Optional properties that might be needed
      IsDelivery: 'NO',
      deliveryPolicyDescription: '',
      numOfDaysOfExpecetdDelivery: 0,
      DeliveryFees: 0,
      IsRetrunPolicy: 'NO',
      returnPolicyDescription: '',
      IsWaranty: 'NO',
      warrantyPolicyDescription: ''
    }
    // Fake file objects from `uploads/`
    const files: Express.Multer.File[] = [
      {
        fieldname: 'images',
        originalname: 'TV1.jpeg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        destination: 'uploads/',
        filename: '19f055955da3c0727ecc59fb814b2c15',
        path: 'uploads/19f055955da3c0727ecc59fb814b2c15',
        size: 8189,
        buffer: null,
        stream: null,
      } as any,
      {
        fieldname: 'images',
        originalname: 'TV2.jpeg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        destination: 'uploads/',
        filename: '5c7ab559c1e1602efe25772ea34df399',
        path: 'uploads/5c7ab559c1e1602efe25772ea34df399',
        size: 8147,
        buffer: null,
        stream: null,
      } as any,
      {
        fieldname: 'images',
        originalname: 'TV2.jpeg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        destination: 'uploads/',
        filename: '5c7ab559c1e1602efe25772ea34df399',
        path: 'uploads/5c7ab559c1e1602efe25772ea34df399',
        size: 8147,
        buffer: null,
        stream: null,
      } as any,
    ];
  
    const result = await this.userAuctionsService.createPendingAuction(
      account.id,
      auctionCreationDTO,
      files,
    );
  
    return { success: true, data: result };
  }
  

  @Put('user/:auctionId/update')
  @UseGuards(AuthGuard)
  @UseInterceptors(AnyFilesInterceptor({ dest: 'uploads/' }))
  async updateAuctionController(
    @Account() account: any,
    @Param('auctionId') auctionId: number,
    @Body() auctionUpdateDTO: AuctionUpdateDTO,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    console.log('Auction update data:', auctionUpdateDTO);
    console.log('Auction update files:', files);

    return {
      success: true,
      data: await this.userAuctionsService.updateAuctionDetails(
        account.id,
        auctionId,
        auctionUpdateDTO,
        files,
      ),
    };
  }

  @Post('/user/:productId/convertListedProductToAuction')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      dest: 'uploads/',
    }),
  )
  async convertListToAuction(
    @Account() account: any,
    @Body() auctionCreationDTO: AuctionCreationDTO,
    @UploadedFiles() images: Array<Express.Multer.File>,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    console.log('The form data convertListToAuction:', auctionCreationDTO);
    const isConvertProductToAuction = true;
    return {
      success: true,
      data: await this.userAuctionsService.createPendingAuction(
        account.id,
        auctionCreationDTO,
        images,
        isConvertProductToAuction,
        productId,
      ),
    };
  }

  @Post('save-draft')
  @UseGuards(AuthGuard)
  // @UseInterceptors(
  //   FilesInterceptor('images', 5, {
  //     dest: 'uploads/',
  //   }),
  // )
  @UseInterceptors(AnyFilesInterceptor({ dest: 'uploads/' }))
  async saveAuctionAsDraftController(
    @Account() account: any,
    @Body() productDTO: ProductDTO,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    console.log('productDTO', productDTO);
    // Separate images and PDFs based on file extension
    const images = files.filter((file) => file.mimetype.startsWith('image/'));
    const relatedDocuments = files.filter(
      (file) => file.mimetype === 'application/pdf',
    );

    console.log('Images:', images);
    console.log('PDFs:', relatedDocuments);
    return {
      success: true,
      data: await this.userAuctionsService.createDraftAuction(
        account.id,
        productDTO,
        files,
        // relatedDocuments,
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

  @Get('/user/expired-auctions')
  @UseGuards(AuthOrGuestGuard)
  async getExpiredAuctions(
    @Account() account: any,
    @Query() paginationDTO: PaginationDTO,
  ) {
    const auctionsPaginated =
      await this.userAuctionsService.findExpiredAuctions(
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

  @Get('/product/similar')
  @UseGuards(AuthOrGuestGuard)
  async getSimilarProducts(
    @Account() account: any,
    @Query('productId', ParseIntPipe) productId: number,
  ) {
    const similarProductsResult =
      await this.userAuctionsService.findSimilarProducts(
        Number(productId),
        account.roles.includes(Role.User) ? Number(account.id) : undefined,
      );

    return {
      success: true,
      count: similarProductsResult.count,
      data: similarProductsResult.similarProducts,
    };
  }

  @Get('/user/sponsored')
  @UseGuards(AuthOrGuestGuard)
  async getSponseredAuctions(@Account() account: any) {
    // console.log('auctions ====> account',account)

    const auctions = await this.userAuctionsService.findSponseredAuctions(
      account.roles,
      account.roles.includes(Role.User) ? Number(account.id) : undefined,
    );

    // console.log('auctions ====> account',auctions)
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

  @Get('/user/user-details')
  @UseGuards(AuthGuard)
  async getAuctionsByOtherUser(
    @Query() getAuctionsByOwnerDTO: GetAuctionsByOtherUserDTO,
  ) {
    const userAuctionsPaginated =
      await this.userAuctionsService.findOtherUserAuctions(
        getAuctionsByOwnerDTO.userId,
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

  @Get('/user/pendingPayment')
  @UseGuards(AuthGuard)
  async getPendingPayment(
    @Account() account: any,
    @Query('auctionId') auctionId: string,
    @Query('paymentType') paymentType: PaymentType,
  ) {
    return await this.userAuctionsService.getPendingPayments(
      auctionId,
      paymentType,
      account.id,
    );
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

  @Post('/user/walletPay')
  @UseGuards(AuthGuard)
  async walletPayForAuction(
    @Account() account: any,
    @Body() walletPayDto: WalletPayDto,
  ) {
    const isWalletPayment = true;
    console.log('wallet pay api called');
    return {
      success: true,
      data: await this.userAuctionsService.payToPublish(
        account.id,
        walletPayDto.auctionId,
        walletPayDto.amount,
        isWalletPayment,
      ),
    };
  }

  @Post('/user/pay-by-banck/upload-bank-statement')
  @UseInterceptors(AnyFilesInterceptor({ dest: 'uploads/' }))
  // @UseInterceptors(FileInterceptor('image', { dest: 'uploads/' }))
  @UseGuards(AuthGuard)
  async uploadBankStatement(
    @Account() account: any,
    @Body('auctionId') auctionId: any,
    @Body('amount') amount: any,
    @UploadedFiles() statement: Express.Multer.File,
  ) {
    console.log('upload banck statement pay api called');
    return {
      success: true,
      data: await this.userAuctionsService.uploadBankStatement(
        statement,
        account.id,
        auctionId,
        amount,
      ),
    };
  }

  @Get('/admin/get-bankTransfer-request')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async getBankTransferPayments() {
    // @Query() getAuctionsByOwnerDTO: GetAuctionsByOwnerDTO,
    const auctionsPaginated =
      await this.userAuctionsService.findBankTransferData();

    return {
      success: true,
      data: auctionsPaginated,
      // pagination: auctionsPaginated.pagination,
      // data: auctionsPaginated.auctions,
    };
  }

  @Patch('/admin/update-bankTransfer-request')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async updateBankTransferRequestsByAdmin(
    @Query('requestId') requestId: string,
    @Body('status') status: PaymentStatus,
  ) {
    const bankTransferRequestData =
      await this.userAuctionsService.updateBankTranferRequestsByAdmin(
        requestId,
        status,
      );

    return {
      success: true,
      data: bankTransferRequestData,
    };
  }
  // @Get('/user/checkKYCStatusForWithdrawal')
  // @UseGuards(AuthGuard)
  // async checkKYCStatusForWithdrawal(
  //   @Account() account: any
  // ){
  //   return this.userAuctionsService.checkKYCStatus(account.id)
  // }

  @Post('/user/addBankAccount')
  @UseGuards(AuthGuard)
  async addBankAccount(
    @Account() account: any,
    @Body() newBankAccountData: addNewBankAccountDto,
  ) {
    try {
      console.log('test withdrawal');

      return await this.userAuctionsService.addBankAccount(
        newBankAccountData,
        account.id,
      );
    } catch (error) {
      console.log(error);
    }
  }

  @Get('/user/getAccountData')
  @UseGuards(AuthGuard)
  async checkKYCStatus(@Account() account: any) {
    return await this.userAuctionsService.getAccountData(Number(account.id));
  }

  @Post('/user/withdrawalRequest')
  @UseGuards(AuthGuard)
  async withdrawalRequest(
    @Account() account: any,
    @Body('amount') amount: number,
    @Body('selectedBankAccountId') selectedBankAccountId: number,
  ) {
    return await this.userAuctionsService.withdrawalRequest(
      amount,
      selectedBankAccountId,
      account.id,
    );
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

  @Get('/user/:auctionId/buyer-location-details')
  @UseGuards(AuthOrGuestGuard)
  async getBuyerDetails(@Param('auctionId', ParseIntPipe) auctionId: number) {
    return {
      success: true,
      data: await this.userAuctionsService.getBuyerDetails(auctionId),
    };
  }

  @Get('/user/:auctionId/location')
  @UseGuards(AuthGuard)
  async getSellerLocation(@Param('auctionId', ParseIntPipe) auctionId: number) {
    return {
      success: true,
      data: await this.userAuctionsService.getSellerLocation(auctionId),
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

  @Put('/user/:auctionId/cancel-auction')
  @UseGuards(AuthGuard, OwnerGuard)
  async cancelAuctionByOwner(
    @Param('auctionId', ParseIntPipe) auctionId: number,
    @Account() account: any,
  ) {
    return await this.userAuctionsService.updateAuctionForCancellation(
      auctionId,
      account.id,
    );
  }

  @Put('/admin/:auctionId/cancel-auction')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async cancelAuctionByAmdin(
    @Param('auctionId', ParseIntPipe) auctionId: number,
    @Query('adminMessage') adminMessage: string,
  ) {
    return await this.userAuctionsService.updateAuctionForCancellationByAdmin(
      auctionId,
      adminMessage,
    );
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
    const deletedImage = await this.userAuctionsService.deleteAuctionImage(
      auctionId,
      imageId,
    );
    return {
      success: true,
      deletedImage,
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
    console.log('[IMPORTANT] images===>', image);
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

  @Post('/user/bidder-walletDeposit')
  @UseGuards(AuthGuard)
  async bidderWalletDeposit(
    @Account() account: any,
    @Body() walletPayDto: WalletPayDto,
  ) {
    const isWalletPayment = true;
    console.log('**==>', walletPayDto);
    return {
      success: true,
      data: await this.userAuctionsService.payDepositByBidder(
        Number(account.id),
        walletPayDto.auctionId,
        Number(walletPayDto.bidAmount),
        isWalletPayment,
        Number(walletPayDto.amount),
      ),
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

  @Post('/user/:auctionId/wallet-bidder-purchase')
  @UseGuards(AuthGuard)
  async auctionPurchasePayWithWalletByBidder(
    @Account() account: any,
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    const isWalletPayment = true;
    return {
      success: true,
      data: await this.userAuctionsService.payAuctionByBidder(
        Number(account.id),
        auctionId,
        isWalletPayment,
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

  @Post('/user/:auctionId/buy-now-through-wallet')
  @UseGuards(AuthGuard)
  async buyNowAuctionThroughWallet(
    @Account() account: any,
    @Param('auctionId', ParseIntPipe) auctionId: number,
  ) {
    const isWalletPayment = true;
    return await this.userAuctionsService.buyNowAuction(
      Number(account.id),
      auctionId,
      isWalletPayment,
    );
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

  @Put('/user/:auctionId/sendItem-forDelivery')
  @UseGuards(AuthGuard)
  async sendItemForDeivery(
    @Account() account: any,
    @Param('auctionId', ParseIntPipe) auctionId: number,
    @Body() body: { message: string },
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.IsSendItemForDelivery(
        Number(account.id),
        auctionId,
        body.message,
      ),
    };
  }
  @Put('/user/:auctionId/set-delivery-type')
  @UseGuards(AuthGuard)
  async setDeliveryType(
    @Param('auctionId', ParseIntPipe) auctionId: number,
    @Body() body: DeliveryTypeDTO,
  ) {
    console.log('auctionId : ', auctionId);
    console.log('body : ', body);
    return {
      success: true,
      data: await this.userAuctionsService.setDeliveryType(
        auctionId,
        body.deliveryType,
      ),
    };
  }

  @Post('/user/auction-complaints')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FilesInterceptor('images', 20, {
      dest: 'uploads/',
    }),
  )
  async uploadComplaintsByBidder(
    @Account() account: any,
    // @Param('auctionId', ParseIntPipe) auctionId : number,
    @Body() AuctionComplaintsData: AuctionComplaintsDTO,
    @UploadedFiles() images: Array<Express.Multer.File>,
  ) {
    console.log('AuctionComplaintsData', AuctionComplaintsData);
    console.log('images : ', images);
    return {
      success: true,
      data: await this.userAuctionsService.uploadAuctionComplaints(
        Number(account.id),
        AuctionComplaintsData,
        images,
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
  @Post('/product-listing')
  @UseGuards(AuthGuard)
  @UseInterceptors(AnyFilesInterceptor({ dest: 'uploads/' }))
  async listOnlyProduct(
    @UploadedFiles() images: Array<Express.Multer.File>,
    @Body('product') productDTO: ProductDTO,
    @Account() account: any,
  ) {
    console.log('product DAta :', productDTO);
    return {
      success: true,
      data: await this.userAuctionsService.listOnlyProduct(
        productDTO,
        images,
        account.id,
      ),
    };
  }
  @Get('/listedProducts/getAllListed-products')
  @UseGuards(AuthOrGuestGuard)
  async fetchAllListedProducts(
    @Account() account: any,
    @Query() getListedProductDTO: GetListedProductDTO,
  ) {
    const listedProductsPaginated =
      await this.userAuctionsService.fetchAllListedOnlyProduct(
        account.roles,
        getListedProductDTO,
        account.id ? Number(account.id) : undefined,
      );
    return {
      success: true,
      pagination: listedProductsPaginated.pagination,
      data: listedProductsPaginated.products,
    };
  }
  @Get('/listedProducts/userProductdetails')
  @UseGuards(AuthOrGuestGuard)
  async fetchOtherUsersListedProducts(
    @Account() account: any,
    @Query() getListedProductByOhterUserDTO: GetListedProductByOhterUserDTO,
  ) {
    const listedProductsPaginated =
      await this.userAuctionsService.fetchListedProductByOthers(
        account.roles,
        getListedProductByOhterUserDTO,
        getListedProductByOhterUserDTO.userId,
      );
    return {
      success: true,
      pagination: listedProductsPaginated.pagination,
      data: listedProductsPaginated.products,
    };
  }

  @Get('/listedProducts/:productId/details')
  @UseGuards(AuthOrGuestGuard)
  async getProductById(
    @Account() account: any,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return {
      success: true,
      data: await this.userAuctionsService.findProductByIdOr404(
        productId,
        account.roles,
        account.id ? Number(account.id) : undefined,
      ),
    };
  }

  @Get('/user/product/analytics')
  @UseGuards(AuthGuard)
  async getListedProductAnalytics(@Account() account: any) {
    const productsAnalytics =
      await this.userAuctionsService.findListedProductsAnalytics(account.id);

    return {
      success: true,
      totalItems: productsAnalytics.count,
      data: productsAnalytics.productsGrouping,
    };
  }

  @Patch('/products/updateProductStatus')
  @UseGuards(AuthGuard)
  async updateProductStatus(
    @Query('productId', ParseIntPipe) productId: number,
    @Body('status') status: ListedProductsStatus,
  ) {
    const updatedProductData =
      await this.userAuctionsService.updateListedProductStatus(
        productId,
        status,
      );

    return {
      success: true,
      data: updatedProductData,
    };
  }
}
