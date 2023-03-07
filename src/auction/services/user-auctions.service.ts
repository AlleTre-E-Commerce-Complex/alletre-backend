import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationService } from '../../common/services/pagination.service';
import { AuctionCreationDTO, ProductDTO } from '../dtos';
import { FirebaseService } from 'src/firebase/firebase.service';
import {
  Auction,
  AuctionStatus,
  AuctionType,
  DurationUnits,
} from '@prisma/client';
import { MethodNotAllowedResponse, NotFoundResponse } from 'src/common/errors';
import { ForbiddenResponse } from 'src/common/errors/ForbiddenResponse';

@Injectable()
export class UserAuctionsService {
  constructor(
    private prismaService: PrismaService,
    private paginationService: PaginationService,
    private firebaseService: FirebaseService,
  ) {}

  async createPendingAuction(
    userId: number,
    auctionCreationBody: AuctionCreationDTO,
    images: Express.Multer.File[],
  ) {
    if (images.length < 3)
      throw new MethodNotAllowedResponse({
        ar: 'من فضلك قم برفع من ثلاث الي خمس صور',
        en: 'Please Upload From 3 To 5 Photos',
      });

    const { type, durationUnit, startDate, product } = auctionCreationBody;

    // Check user can create auction (hasCompleteProfile)
    await this.userHasCompleteProfile(userId);

    // Create Product
    const productId = await this.createProduct(product, images);

    // Create Auction
    switch (durationUnit) {
      case DurationUnits.DAYS:
        if (type === AuctionType.ON_TIME && !startDate) {
          // Create ON_TIME Daily auction
          return await this.createOnTimeDailyAuction(
            userId,
            productId,
            auctionCreationBody,
          );
        } else if (type === AuctionType.SCHEDULED && startDate) {
          // Create Schedule Daily auction
          return await this.createScheduleDailyAuction(
            userId,
            productId,
            auctionCreationBody,
          );
        }
        break;

      case DurationUnits.HOURS:
        if (type === AuctionType.ON_TIME && !startDate) {
          // Create ON_TIME hours auction
          return await this.createOnTimeHoursAuction(
            userId,
            productId,
            auctionCreationBody,
          );
        } else if (type === AuctionType.SCHEDULED && startDate) {
          // Create Schedule hours auction
          return await this.createScheduleHoursAuction(
            userId,
            productId,
            auctionCreationBody,
          );
        }
        break;
    }
  }
  async createDraftAuction(
    userId: number,
    productDTO: ProductDTO,
    images: Express.Multer.File[],
  ) {
    if (images.length < 3)
      throw new MethodNotAllowedResponse({
        ar: 'من فضلك قم برفع من ثلاث الي خمس صور',
        en: 'Please Upload From 3 To 5 Photos',
      });

    // Check user can create auction (hasCompleteProfile)
    await this.userHasCompleteProfile(userId);

    // Create Product
    const productId = await this.createProduct(productDTO, images);

    // Create Auction
    return await this.prismaService.auction.create({
      data: {
        userId,
        productId,
        status: AuctionStatus.DRAFTED,
      },
    });
  }

  async deleteDraftedAuction(userId: number, auctionId: number) {
    const auction = await this.checkAuctionExistance(auctionId);

    await this.isAuctionOwner(userId, auctionId);
    await this.auctionCanBeDeletedByOwner(auctionId);

    const deletedImages = this.prismaService.image.deleteMany({
      where: { productId: auction.productId },
    });

    const deletedProduct = this.prismaService.product.delete({
      where: { id: auction.productId },
    });

    const deletedAuction = this.prismaService.auction.delete({
      where: { id: auctionId },
    });

    await this.prismaService.$transaction([
      deletedImages,
      deletedAuction,
      deletedProduct,
    ]);
  }

  // TODO: Add status as a filter for ownes auctions
  async findUserOwnesAuctions(
    userId: number,
    page: number,
    perPage: number,
    status: AuctionStatus,
  ) {
    const skip = Number(page) || 1;
    const limit = Number(perPage) || 10;

    const userAuctions = await this.prismaService.auction.findMany({
      where: {
        userId: userId,
      },
      skip: skip,
      take: limit,
    });

    const userOwensAuctionsCount = await this.prismaService.auction.count({
      where: { userId: userId },
    });

    const totalPages = this.paginationService.getTotalPages(
      userOwensAuctionsCount,
      limit,
    );

    return { userAuctions, userOwensAuctionsCount, totalPages };
  }
  async findAuctionsForUser(page: number, perPage: number) {
    const skip = Number(page) || 1;
    const limit = Number(perPage) || 10;

    const auctions = await this.prismaService.auction.findMany({
      skip: skip,
      take: limit,
    });

    const auctionsCount = await this.prismaService.auction.count();

    const totalPages = this.paginationService.getTotalPages(
      auctionsCount,
      limit,
    );

    return { auctions, auctionsCount, totalPages };
  }
  async findAuctionsForGuest(page: number, perPage: number) {
    const skip = Number(page) || 1;
    const limit = Number(perPage) || 10;

    const auctions = await this.prismaService.auction.findMany({
      skip: skip,
      take: limit,
    });

    const auctionsCount = await this.prismaService.auction.count();

    const totalPages = this.paginationService.getTotalPages(
      auctionsCount,
      limit,
    );

    return { auctions, auctionsCount, totalPages };
  }
  async findAuctionByIdOr404(auctionId: number) {
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
      include: {
        product: {
          include: {
            category: true,
            brand: true,
            subCategory: true,
            city: true,
            country: true,
            images: true,
          },
        },
      },
    });

    if (!auction)
      throw new NotFoundResponse({
        ar: 'لا يوجد هذا الاعلان',
        en: 'Auction Not Found',
      });

    return auction;
  }

  async checkAuctionExistance(auctionId: number) {
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction)
      throw new NotFoundResponse({
        ar: 'لا يوجد هذا الاعلان',
        en: 'Auction Not Found',
      });

    return auction;
  }
  async updateAuctionById(userId: number, auctionId: number) {}

  async makeBidByUser(auctionId: number, userId: number, bidAmount: number) {}

  async viewAuctionBides(auctionId: number) {}

  private async createOnTimeDailyAuction(
    userId: number,
    productId: number,
    auctionDto: AuctionCreationDTO,
  ) {
    const {
      type,
      durationUnit,
      durationInDays,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      locationId,
    } = auctionDto;

    const auction = await this.prismaService.auction.create({
      data: {
        userId,
        productId,
        type,
        durationUnit,
        durationInDays,
        startBidAmount,
        ...(isBuyNowAllowed ? { isBuyNowAllowed } : {}),
        ...(acceptedAmount ? { acceptedAmount } : {}),
        locationId,
      },
    });

    // TODO: Create Payment Service and set startDate(cuurentDate) & expiryDate=(Date()+durationInDays) & status=PUBLISHED when payment proceed
    return auction;
  }

  private async createOnTimeHoursAuction(
    userId: number,
    productId: number,
    auctionDto: AuctionCreationDTO,
  ) {
    const {
      type,
      durationUnit,
      durationInHours,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      locationId,
    } = auctionDto;

    const auction = await this.prismaService.auction.create({
      data: {
        userId,
        productId,
        type,
        durationUnit,
        durationInHours,
        startBidAmount,
        ...(isBuyNowAllowed ? { isBuyNowAllowed } : {}),
        ...(acceptedAmount ? { acceptedAmount } : {}),
        locationId,
      },
    });

    // TODO: Create Payment Service and set startDate(currentDate) & expriyDate=(Date()+durationInHours) & status=PUBLISHED when payment proceed

    return auction;
  }

  private async createScheduleDailyAuction(
    userId: number,
    productId: number,
    auctionDto: AuctionCreationDTO,
  ) {
    const {
      type,
      durationUnit,
      durationInDays,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      locationId,
      startDate,
    } = auctionDto;

    const auction = await this.prismaService.auction.create({
      data: {
        userId,
        productId,
        type,
        durationUnit,
        durationInDays,
        startBidAmount,
        ...(isBuyNowAllowed ? { isBuyNowAllowed } : {}),
        ...(acceptedAmount ? { acceptedAmount } : {}),
        locationId,
        startDate,
      },
    });

    // TODO: Create Payment Service and set expiryDate=(startDate+durationInDays)& status=PUBLISHED when payment proceed
    return auction;
  }

  private async createScheduleHoursAuction(
    userId: number,
    productId: number,
    auctionDto: AuctionCreationDTO,
  ) {
    const {
      type,
      durationUnit,
      durationInHours,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      locationId,
      startDate,
    } = auctionDto;

    const auction = await this.prismaService.auction.create({
      data: {
        userId,
        productId,
        type,
        durationUnit,
        durationInHours,
        startBidAmount,
        ...(isBuyNowAllowed ? { isBuyNowAllowed } : {}),
        ...(acceptedAmount ? { acceptedAmount } : {}),
        locationId,
        startDate,
      },
    });

    // TODO: Create Payment Service and set expiryDate=(startDate+durationInHours) & status=PUBLISHED when payment proceed

    return auction;
  }

  private async createProduct(
    productBody: ProductDTO,
    images: Express.Multer.File[],
  ) {
    const {
      title,
      model,
      categoryId,
      subCategoryId,
      brandId,
      description,
      usageStatus,
      color,
      screenSize,
      processor,
      operatingSystem,
      releaseYear,
      regionOfManufacture,
      ramSize,
      cameraType,
      material,
      age,
      totalArea,
      numberOfRooms,
      numberOfFloors,
      landType,
      countryId,
      cityId,
    } = productBody;

    const mandatoryProductProperties = {
      title,
      categoryId,
      description,
    };
    const optinalProductProperties = {
      usageStatus,
      color,
      screenSize,
      processor,
      operatingSystem,
      releaseYear,
      regionOfManufacture,
      ramSize,
      cameraType,
      material,
      age,
      totalArea,
      numberOfRooms,
      numberOfFloors,
      landType,
      countryId,
      cityId,
      subCategoryId,
      model,
      brandId,
    };

    const imagesHolder = [];

    for (const image of images) {
      const uploadedImage = await this.firebaseService.uploadImage(image);
      imagesHolder.push(uploadedImage);
    }

    const createdProduct = await this.prismaService.product.create({
      data: {
        ...mandatoryProductProperties,
        ...optinalProductProperties,
      },
    });

    imagesHolder.forEach(async (image) => {
      await this.prismaService.image.create({
        data: {
          productId: createdProduct.id,
          imageLink: image.fileLink,
          imagePath: image.filePath,
        },
      });
    });

    return createdProduct.id;
  }

  private async userHasCompleteProfile(userId: number) {
    const user = await this.prismaService.user.findUnique({
      where: { id: Number(userId) },
    });

    if (!user.hasCompletedProfile)
      throw new MethodNotAllowedResponse({
        ar: 'اكمل بياناتك',
        en: 'Complete your profile',
      });
  }

  private async isAuctionOwner(userId: number, auctionId: number) {
    const auction = await this.prismaService.auction.findFirst({
      where: { id: Number(auctionId), userId: Number(userId) },
    });

    if (!auction)
      throw new ForbiddenResponse({
        ar: 'ليس لديك صلاحيات لهذا الاعلان',
        en: 'You have no authorization for accessing this resource',
      });
  }

  private async auctionCanBeDeletedByOwner(auctionId: number) {
    const auction = await this.prismaService.auction.findFirst({
      where: { id: auctionId },
    });

    if (auction.status !== AuctionStatus.DRAFTED)
      throw new ForbiddenResponse({
        ar: 'لا يمكنك حذف الاعلان',
        en: 'Auction Can Not Be Deleted',
      });
  }
}
