import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationService } from '../../common/services/pagination.service';
import {
  AuctionCreationDTO,
  GetAuctionsByOwnerDTO,
  GetAuctionsDTO,
  ProductDTO,
} from '../dtos';
import { FirebaseService } from 'src/firebase/firebase.service';
import {
  Auction,
  AuctionStatus,
  AuctionType,
  DurationUnits,
  Product,
} from '@prisma/client';
import {
  MethodNotAllowedResponse,
  NotFoundResponse,
  ForbiddenResponse,
} from 'src/common/errors';
import { Role } from 'src/auth/enums/role.enum';

@Injectable()
export class UserAuctionsService {
  constructor(
    private prismaService: PrismaService,
    private paginationService: PaginationService,
    private firebaseService: FirebaseService,
  ) {}

  // TODO: Add price field in product table and when user select isallowedPayment set price =acceptedAmount
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

    // Check user can create auction (hasCompleteProfile)
    await this._userHasCompleteProfile(userId);

    const { type, durationUnit, startDate, product } = auctionCreationBody;

    // Create Product
    const productId = await this._createProduct(product, images);

    // Create Auction
    switch (durationUnit) {
      case DurationUnits.DAYS:
        if (type === AuctionType.ON_TIME || !startDate) {
          // Create ON_TIME Daily auction
          return await this._createOnTimeDailyAuction(
            userId,
            productId,
            auctionCreationBody,
          );
        } else if (type === AuctionType.SCHEDULED || startDate) {
          // Create Schedule Daily auction
          return await this._createScheduleDailyAuction(
            userId,
            productId,
            auctionCreationBody,
          );
        }
        break;

      case DurationUnits.HOURS:
        if (type === AuctionType.ON_TIME || !startDate) {
          // Create ON_TIME hours auction
          return await this._createOnTimeHoursAuction(
            userId,
            productId,
            auctionCreationBody,
          );
        } else if (type === AuctionType.SCHEDULED || startDate) {
          // Create Schedule hours auction
          return await this._createScheduleHoursAuction(
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
    // Check user can create auction (hasCompleteProfile)
    await this._userHasCompleteProfile(userId);

    // Create Product
    const productId = await this._createProduct(productDTO, images);

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
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);

    await this._auctionCanBeDeletedByOwner(auctionId);

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
    getAuctionsByOwnerDTO: GetAuctionsByOwnerDTO,
  ) {
    const { page = 1, perPage = 10, status, type } = getAuctionsByOwnerDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const userAuctions = await this.prismaService.auction.findMany({
      skip: skip,
      take: limit,
      where: {
        userId: userId,
        ...(status ? { status: status } : {}),
        ...(type ? { type } : {}),
      },
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

    const userOwensAuctionsCount = await this.prismaService.auction.count({
      where: {
        userId: userId,
        ...(status ? { status: status } : {}),
        ...(type ? { type } : {}),
      },
    });

    const pagination = this.paginationService.getPagination(
      userOwensAuctionsCount,
      page,
      perPage,
    );

    return { userAuctions, pagination };
  }

  async findAuctionsAnalyticsForOwner(userId: number) {
    const count = await this.prismaService.auction.count({ where: { userId } });
    const auctionsGrouping = await this.prismaService.auction.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true },
    });

    return {
      count,
      auctionsGrouping: auctionsGrouping?.length
        ? auctionsGrouping.map((item) => {
            return {
              count: item['_count']?.status,
              status: item.status,
            };
          })
        : [],
    };
  }

  async findAuctionsForUser(
    roles: Role[],
    getAuctionsDTO: GetAuctionsDTO,
    userId?: number,
  ) {
    const {
      page = 1,
      perPage = 10,
      brands,
      categories,
      countries,
      priceFrom,
      priceTo,
      sellingType,
      usageStatus,
      title,
    } = getAuctionsDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const productFilter = this._productFilterApplied({
      brands,
      categories,
      usageStatus,
      title,
    });

    const auctionFilter = this._auctionFilterApplied({
      priceFrom,
      priceTo,
      countries,
      sellingType,
    });
    const auctions = await this.prismaService.auction.findMany({
      where: {
        status: { in: [AuctionStatus.ACTIVE, AuctionStatus.IN_SCHEDULED] },
        ...auctionFilter,
        product: { ...productFilter },
      },
      select: {
        id: true,
        userId: true,
        acceptedAmount: true,
        productId: true,
        status: true,
        type: true,
        createdAt: true,
        durationInDays: true,
        durationInHours: true,
        durationUnit: true,
        expiryDate: true,
        isBuyNowAllowed: true,
        startBidAmount: true,
        startDate: true,
        locationId: true,
        product: {
          select: {
            id: true,
            title: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
          },
        },
      },
      skip: skip,
      take: limit,
    });

    const auctionsCount = await this.prismaService.auction.count({
      where: {
        status: { in: [AuctionStatus.ACTIVE, AuctionStatus.IN_SCHEDULED] },
        ...auctionFilter,
        product: { ...productFilter },
      },
    });

    const pagination = this.paginationService.getPagination(
      auctionsCount,
      page,
      perPage,
    );

    if (roles.includes(Role.User))
      return {
        auctions: this._injectIsMyAuctionKey(userId, auctions),
        pagination,
      };

    return {
      auctions,
      pagination,
    };
  }

  async findOwnerAuctionByIdOr404(auctionId: number) {
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
      include: {
        product: {
          include: {
            category: { select: { nameEn: true } },
            brand: true,
            subCategory: true,
            city: true,
            country: true,
            images: true,
          },
        },
        user: { select: { lang: true } },
        location: {
          include: { city: true, country: true },
        },
      },
    });

    if (!auction)
      throw new NotFoundResponse({
        ar: 'لا يوجد هذا الاعلان',
        en: 'Auction Not Found',
      });

    return this._reformatAuctionObject(auction.user.lang, auction);
  }

  async findAuctionByIdOr404(
    auctionId: number,
    roles: Role[],
    userId?: number,
  ) {
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
      include: {
        product: {
          include: {
            category: { select: { nameEn: true } },
            brand: true,
            subCategory: true,
            city: true,
            country: true,
            images: true,
          },
        },
        user: { select: { lang: true } },
        location: {
          include: { city: true, country: true },
        },
      },
    });

    if (!auction)
      throw new NotFoundResponse({
        ar: 'لا يوجد هذا الاعلان',
        en: 'Auction Not Found',
      });

    const formatedAuction = this._reformatAuctionObject(
      auction.user.lang,
      auction,
    );

    if (roles.includes(Role.User)) {
      if (Number(formatedAuction.userId) === Number(userId)) {
        formatedAuction['isMyAuction'] = true;
      } else {
        formatedAuction['isMyAuction'] = false;
      }
    }
    return formatedAuction;
  }

  async checkAuctionExistanceAndReturn(auctionId: number) {
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

  private async _createOnTimeDailyAuction(
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

    let auction: Auction;
    try {
      auction = await this.prismaService.auction.create({
        data: {
          userId,
          productId,
          type,
          durationUnit,
          durationInDays,
          startBidAmount,
          ...(isBuyNowAllowed == 'YES' ? { isBuyNowAllowed: true } : {}),
          ...(acceptedAmount ? { acceptedAmount } : {}),
          locationId,
        },
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في اضافة الاعلان تأكد من صحة البيانات',
        en: 'Something Went Wrong While Adding Your Auction',
      });
    }

    // TODO: Create Payment Service and set startDate(cuurentDate) & expiryDate=(Date()+durationInDays) & status=PUBLISHED when payment proceed
    return auction;
  }

  private async _createOnTimeHoursAuction(
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

    let auction: Auction;

    try {
      auction = await this.prismaService.auction.create({
        data: {
          userId,
          productId,
          type,
          durationUnit,
          durationInHours,
          startBidAmount,
          ...(isBuyNowAllowed == 'YES' ? { isBuyNowAllowed: true } : {}),
          ...(acceptedAmount ? { acceptedAmount } : {}),
          locationId,
        },
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في اضافة الاعلان تأكد من صحة البيانات',
        en: 'Something Went Wrong While Adding Your Auction',
      });
    }

    // TODO: Create Payment Service and set startDate(currentDate) & expriyDate=(Date()+durationInHours) & status=PUBLISHED when payment proceed

    return auction;
  }

  private async _createScheduleDailyAuction(
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

    let auction: Auction;

    try {
      auction = await this.prismaService.auction.create({
        data: {
          userId,
          productId,
          type,
          durationUnit,
          durationInDays,
          startBidAmount,
          ...(isBuyNowAllowed == 'YES' ? { isBuyNowAllowed: true } : {}),
          ...(acceptedAmount ? { acceptedAmount } : {}),
          locationId,
          startDate,
        },
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في اضافة الاعلان تأكد من صحة البيانات',
        en: 'Something Went Wrong While Adding Your Auction',
      });
    }

    // TODO: Create Payment Service and set expiryDate=(startDate+durationInDays)& status=IN_SCHEDULED if(current date < startDate) when payment proceed else set PUBLISHED
    return auction;
  }

  private async _createScheduleHoursAuction(
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

    let auction: Auction;

    try {
      auction = await this.prismaService.auction.create({
        data: {
          userId,
          productId,
          type,
          durationUnit,
          durationInHours,
          startBidAmount,
          ...(isBuyNowAllowed == 'YES' ? { isBuyNowAllowed: true } : {}),
          ...(acceptedAmount ? { acceptedAmount } : {}),
          locationId,
          startDate,
        },
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في اضافة الاعلان تأكد من صحة البيانات',
        en: 'Something Went Wrong While Adding Your Auction',
      });
    }

    // TODO: Create Payment Service and set expiryDate=(startDate+durationInHours) & status=IN_SCHEDULED if(current date < startDate) when payment proceed else set PUBLISHED

    return auction;
  }

  private async _createProduct(
    productBody: ProductDTO,
    images?: Express.Multer.File[],
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

    const nonNumericOptionalFields = {
      usageStatus,
      color,
      processor,
      operatingSystem,
      releaseYear,
      regionOfManufacture,
      cameraType,
      material,
      landType,
      model,
    };

    let createdProduct: Product;
    try {
      createdProduct = await this.prismaService.product.create({
        data: {
          title,
          categoryId: Number(categoryId),
          description,
          ...(age ? { age: Number(age) } : {}),
          ...(subCategoryId ? { subCategoryId: Number(subCategoryId) } : {}),
          ...(brandId ? { brandId: Number(brandId) } : {}),
          ...(screenSize ? { screenSize: Number(screenSize) } : {}),
          ...(ramSize ? { ramSize: Number(ramSize) } : {}),
          ...(totalArea ? { totalArea: Number(totalArea) } : {}),
          ...(numberOfRooms ? { numberOfRooms: Number(numberOfRooms) } : {}),
          ...(numberOfFloors ? { numberOfFloors: Number(numberOfFloors) } : {}),
          ...(countryId ? { countryId: Number(countryId) } : {}),
          ...(cityId ? { cityId: Number(cityId) } : {}),
          ...nonNumericOptionalFields,
        },
      });
    } catch (error) {
      console.log(error);

      throw new MethodNotAllowedResponse({
        ar: 'خطأ في عملية إضافة المنتج',
        en: 'Something Went Wrong While Adding Your Product',
      });
    }

    try {
      const imagesHolder = [];

      if (images?.length) {
        for (const image of images) {
          const uploadedImage = await this.firebaseService.uploadImage(image);
          imagesHolder.push(uploadedImage);
        }
      }

      if (imagesHolder?.length) {
        imagesHolder.forEach(async (image) => {
          await this.prismaService.image.create({
            data: {
              productId: createdProduct.id,
              imageLink: image.fileLink,
              imagePath: image.filePath,
            },
          });
        });
      }
    } catch (error) {
      console.log(error);

      throw new MethodNotAllowedResponse({
        ar: 'خطأ في عملية إضافة المنتج',
        en: 'Something Went Wrong While Adding Your Product',
      });
    }

    return createdProduct.id;
  }

  private async _userHasCompleteProfile(userId: number) {
    const user = await this.prismaService.user.findUnique({
      where: { id: Number(userId) },
    });

    if (!user.hasCompletedProfile)
      throw new MethodNotAllowedResponse({
        ar: 'اكمل بياناتك',
        en: 'Complete your profile',
      });
  }

  private _productFilterApplied({ brands, categories, usageStatus, title }) {
    let productFilterOrSearch = {};

    if (title && title.length) {
      productFilterOrSearch = {
        ...productFilterOrSearch,
        ...{ title: { contains: title } },
      };
    }
    if (categories?.length) {
      productFilterOrSearch = {
        ...productFilterOrSearch,
        ...{ categoryId: { in: categories } },
      };
    }
    if (brands?.length) {
      productFilterOrSearch = {
        ...productFilterOrSearch,
        ...{ brandId: { in: brands } },
      };
    }
    if (usageStatus?.length) {
      productFilterOrSearch = {
        ...productFilterOrSearch,
        ...{ usageStatus: { in: usageStatus } },
      };
    }

    return productFilterOrSearch;
  }

  private _injectIsMyAuctionKey(userId: number, auctions: Auction[]) {
    const formatedAuction = auctions.map((auction) => {
      if (Number(auction.userId) === Number(userId)) {
        auction['isMyAuction'] = true;
      } else {
        auction['isMyAuction'] = false;
      }

      return auction;
    });

    return formatedAuction;
  }
  private _auctionFilterApplied({
    priceFrom,
    priceTo,
    countries,
    sellingType,
  }) {
    let auctionFilterOrSearch = {};

    if (priceFrom && priceTo) {
      auctionFilterOrSearch = {
        ...auctionFilterOrSearch,
        AND: [
          { startBidAmount: { gte: priceFrom } },
          { startBidAmount: { lte: priceTo } },
        ],
      };
    }

    if (countries?.length) {
      auctionFilterOrSearch = {
        ...auctionFilterOrSearch,
        ...{ location: { countryId: { in: countries } } },
      };
    }
    if (sellingType && sellingType.length) {
      if (sellingType === 'Auction')
        auctionFilterOrSearch = {
          ...auctionFilterOrSearch,
          ...{ isBuyNowAllowed: false },
        };
      if (sellingType === 'Buy_Now')
        auctionFilterOrSearch = {
          ...auctionFilterOrSearch,
          ...{ isBuyNowAllowed: true },
        };
    }
    return auctionFilterOrSearch;
  }
  private async _isAuctionOwner(userId: number, auctionId: number) {
    const auction = await this.prismaService.auction.findFirst({
      where: { id: Number(auctionId), userId: Number(userId) },
    });

    if (!auction)
      throw new ForbiddenResponse({
        ar: 'ليس لديك صلاحيات لهذا الاعلان',
        en: 'You have no authorization for accessing this resource',
      });
  }

  private async _auctionCanBeDeletedByOwner(auctionId: number) {
    const auction = await this.prismaService.auction.findFirst({
      where: { id: auctionId },
    });

    if (auction.status !== AuctionStatus.DRAFTED)
      throw new ForbiddenResponse({
        ar: 'لا يمكنك حذف الاعلان',
        en: 'Auction Can Not Be Deleted',
      });
  }

  private _execludeNullFields(auction: Auction) {
    for (const field in auction['product']) {
      if (auction['product'][field] === null) delete auction['product'][field];
    }

    return auction;
  }

  private _reformatAuctionObject(userLang: string, auction: Auction) {
    if (auction['product']['brand']) {
      const brandName = auction['product']['brand']['name'];
      delete auction['product']['brand'];
      auction['product']['brand'] = brandName;
    }
    if (auction['product']['city']) {
      const cityName =
        userLang === 'en'
          ? auction['product']['city']['nameEn']
          : auction['product']['city']['nameAr'];
      delete auction['product']['city'];
      auction['product']['city'] = cityName;
    }
    if (auction['product']['country']) {
      const countryName =
        userLang === 'en'
          ? auction['product']['country']['nameEn']
          : auction['product']['country']['nameAr'];
      delete auction['product']['country'];
      auction['product']['country'] = countryName;
    }
    delete auction['user'];

    return this._execludeNullFields(auction);
  }
}
