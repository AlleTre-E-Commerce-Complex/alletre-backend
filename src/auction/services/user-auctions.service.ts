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
    const {
      type,
      durationUnit,
      durationInDays,
      durationInHours,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      startDate,
      locationId,
      product,
    } = auctionCreationBody;

    // Check user can create auction (hasCompleteProfile)

    // Create Product
    const productId = await this.createProduct(product, images);

    // Create Auction
    let auction: Auction;
    switch (durationUnit) {
      case DurationUnits.DAYS:
        if (type === AuctionType.ON_TIME && !startDate) {
          // Create ON_TIME Daily auction
        } else if (type === AuctionType.SCHEDULED && startDate) {
          // Create Schedule Daily auction
        }
        break;

      case DurationUnits.HOURS:
        if (type === AuctionType.ON_TIME && !startDate) {
          // Create ON_TIME hours auction
        } else if (type === AuctionType.SCHEDULED && startDate) {
          // Create Schedule hours auction
        }
        break;
    }
  }
  async createDraftAuction(
    userId: number,
    productDTO: ProductDTO,
    images: Express.Multer.File[],
  ) {
    // Check user can create auction (hasCompleteProfile)

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
  async findUserOwnesAuctions(userId: number, page: number, perPage: number) {
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
  async findAuctionById(auctionId: number) {
    return await this.prismaService.auction.findUnique({
      where: { id: auctionId },
    });
  }
  async updateAuctionById(userId: number, auctionId: number) {}

  async makeBidByUser(auctionId: number, userId: number, bidAmount: number) {}

  async viewAuctionBides(auctionId: number) {}

  private async createOnTimeDailyAuction(userId: number) {}

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

    const uploadedImages = await this.uploadProductImages(images);
    const productImages = uploadedImages.map((image: any) => {
      return {
        productId: createdProduct.id,
        imageLink: image.fileLink,
        imagePath: image.filePath,
      };
    });

    console.log('Uploaded Images', productImages);

    const createdProduct = await this.prismaService.product.create({
      data: {
        ...mandatoryProductProperties,
        ...optinalProductProperties,
        images: {
          create: productImages,
        },
      },
    });

    return createdProduct.id;
  }

  private async uploadProductImages(images: Express.Multer.File[]) {
    const uploadedFiles = images.map(async (image: Express.Multer.File) => {
      return await this.firebaseService.uploadImage(image);
    });

    return uploadedFiles;
  }
}
