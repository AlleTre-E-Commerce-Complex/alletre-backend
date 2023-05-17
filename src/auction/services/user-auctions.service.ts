import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationService } from '../../common/services/pagination.service';
import {
  AuctionCreationDTO,
  GetAuctionsByOwnerDTO,
  GetAuctionsDTO,
  PaginationDTO,
  ProductDTO,
} from '../dtos';
import { FirebaseService } from 'src/firebase/firebase.service';
import {
  Auction,
  AuctionStatus,
  AuctionType,
  DurationUnits,
  Prisma,
  Product,
} from '@prisma/client';
import { MethodNotAllowedResponse, NotFoundResponse } from 'src/common/errors';
import { Role } from 'src/auth/enums/role.enum';
import { AuctionsHelper } from '../helpers/auctions-helper';
import { Decimal } from '@prisma/client/runtime';
import { BidsWebSocketGateway } from '../gateway/bids.gateway';

@Injectable()
export class UserAuctionsService {
  constructor(
    private prismaService: PrismaService,
    private paginationService: PaginationService,
    private firebaseService: FirebaseService,
    private auctionsHelper: AuctionsHelper,
    private bidsWebSocketGateway: BidsWebSocketGateway,
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
    await this.auctionsHelper._userHasCompleteProfile(userId);

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
    await this.auctionsHelper._userHasCompleteProfile(userId);

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

  async updateDraftAuction(auctionId: number, productDTO: ProductDTO) {
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);

    await this.auctionsHelper._isAuctionValidForUpdate(auctionId);

    await this._updateProduct(auction.productId, productDTO);

    return auction;
  }

  async updateAuction(
    auctionId: number,
    auctionCreationDTO: AuctionCreationDTO,
    userId: number,
  ) {
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);

    await this.auctionsHelper._isAuctionValidForUpdate(auctionId);

    const { type, durationUnit, startDate, product } = auctionCreationDTO;

    const productId = await this._updateProduct(auction.productId, product);

    // Update Auction
    switch (durationUnit) {
      case DurationUnits.DAYS:
        if (type === AuctionType.ON_TIME || !startDate) {
          // Update ON_TIME Daily auction
          return await this._updateOnTimeDailyAuction(
            auctionId,
            userId,
            productId,
            auctionCreationDTO,
          );
        } else if (type === AuctionType.SCHEDULED || startDate) {
          // Update Schedule Daily auction
          return await this._updateScheduleDailyAuction(
            auctionId,
            userId,
            productId,
            auctionCreationDTO,
          );
        }
        break;

      case DurationUnits.HOURS:
        if (type === AuctionType.ON_TIME || !startDate) {
          // Update ON_TIME hours auction
          return await this._updateOnTimeHoursAuction(
            auctionId,
            userId,
            productId,
            auctionCreationDTO,
          );
        } else if (type === AuctionType.SCHEDULED || startDate) {
          // Update Schedule hours auction
          return await this._updateScheduleHoursAuction(
            auctionId,
            userId,
            productId,
            auctionCreationDTO,
          );
        }
        break;
    }
  }

  async deleteDraftedAuction(userId: number, auctionId: number) {
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);

    await this.auctionsHelper._auctionCanBeDeletedByOwner(auctionId);

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
    const startDate = new Date('2023-05-08T09:42:15.697Z');
    const expiryDate = new Date('2023-05-12T09:42:15.697Z');

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
        _count: { select: { bids: true } },
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
      auctionStatus,
    } = getAuctionsDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const productFilter = this.auctionsHelper._productFilterApplied({
      brands,
      categories,
      usageStatus,
      title,
    });

    const auctionFilter = this.auctionsHelper._auctionFilterApplied({
      priceFrom,
      priceTo,
      countries,
      sellingType,
    });

    let auctionsStatusFilter = {};
    if (auctionStatus && auctionStatus.length) {
      if (auctionStatus === AuctionStatus.IN_SCHEDULED) {
        auctionsStatusFilter = {
          ...auctionsStatusFilter,
          status: AuctionStatus.IN_SCHEDULED,
        };
      } else if (auctionStatus === AuctionStatus.ACTIVE) {
        const today = new Date();
        const startOfToday = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
        );
        const endOfToday = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() + 1,
          0,
          0,
          -1,
        );
        auctionsStatusFilter = {
          ...auctionsStatusFilter,
          status: AuctionStatus.ACTIVE,
          expiryDate: {
            lte: endOfToday,
            gte: startOfToday,
          },
        };
      }
    } else {
      auctionsStatusFilter = {
        ...auctionsStatusFilter,
        status: { in: [AuctionStatus.ACTIVE, AuctionStatus.IN_SCHEDULED] },
      };
    }
    const auctions = await this.prismaService.auction.findMany({
      where: {
        ...auctionsStatusFilter,
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
        endDate: true,
        isBuyNowAllowed: true,
        startBidAmount: true,
        startDate: true,
        locationId: true,
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
          },
        },
        _count: { select: { bids: true } },
      },
      skip: skip,
      take: limit,
    });

    const auctionsCount = await this.prismaService.auction.count({
      where: {
        ...auctionsStatusFilter,
        ...auctionFilter,
        product: { ...productFilter },
      },
    });

    const pagination = this.paginationService.getPagination(
      auctionsCount,
      page,
      perPage,
    );

    if (roles.includes(Role.User)) {
      const savedAuctions =
        await this.auctionsHelper._injectIsSavedKeyToAuctionsList(
          userId,
          auctions,
        );
      return {
        auctions: this.auctionsHelper._injectIsMyAuctionKeyToAuctionsList(
          userId,
          savedAuctions,
        ),
        pagination,
      };
    }

    return {
      auctions,
      pagination,
    };
  }

  async findLiveAuctionsForUser(
    roles: Role[],
    paginationDTO: PaginationDTO,
    userId?: number,
  ) {
    const { page = 1, perPage = 4 } = paginationDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      0,
      0,
      0,
      0,
    );
    const endOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59,
      999,
    );

    console.log(endOfToday);

    const auctions = await this.prismaService.auction.findMany({
      where: {
        status: AuctionStatus.ACTIVE,
        expiryDate: {
          lte: endOfToday,
          gte: startOfToday,
        },
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
        endDate: true,
        isBuyNowAllowed: true,
        startBidAmount: true,
        startDate: true,
        locationId: true,
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
          },
        },
        _count: { select: { bids: true } },
      },
      skip: skip,
      take: limit,
    });

    const auctionsCount = await this.prismaService.auction.count({
      where: {
        status: AuctionStatus.ACTIVE,
        expiryDate: {
          lte: endOfToday,
          gte: startOfToday,
        },
      },
    });

    const pagination = this.paginationService.getPagination(
      auctionsCount,
      page,
      perPage,
    );

    if (roles.includes(Role.User)) {
      const savedAuctions =
        await this.auctionsHelper._injectIsSavedKeyToAuctionsList(
          userId,
          auctions,
        );
      return {
        auctions: this.auctionsHelper._injectIsMyAuctionKeyToAuctionsList(
          userId,
          savedAuctions,
        ),
        pagination,
      };
    }

    return {
      auctions,
      pagination,
    };
  }

  async findBuyNowAuctionsForUser(
    roles: Role[],
    paginationDTO: PaginationDTO,
    userId?: number,
  ) {
    const { page = 1, perPage = 4 } = paginationDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const auctions = await this.prismaService.auction.findMany({
      where: {
        status: AuctionStatus.ACTIVE,
        isBuyNowAllowed: true,
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
        endDate: true,
        isBuyNowAllowed: true,
        startBidAmount: true,
        startDate: true,
        locationId: true,
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
          },
        },
        _count: { select: { bids: true } },
      },
      skip: skip,
      take: limit,
    });

    const auctionsCount = await this.prismaService.auction.count({
      where: {
        status: AuctionStatus.ACTIVE,
        isBuyNowAllowed: true,
      },
    });

    const pagination = this.paginationService.getPagination(
      auctionsCount,
      page,
      perPage,
    );

    if (roles.includes(Role.User)) {
      const savedAuctions =
        await this.auctionsHelper._injectIsSavedKeyToAuctionsList(
          userId,
          auctions,
        );
      return {
        auctions: this.auctionsHelper._injectIsMyAuctionKeyToAuctionsList(
          userId,
          savedAuctions,
        ),
        pagination,
      };
    }

    return {
      auctions,
      pagination,
    };
  }
  async findUpCommingAuctionsForUser(
    roles: Role[],
    paginationDTO: PaginationDTO,
    userId?: number,
  ) {
    const { page = 1, perPage = 4 } = paginationDTO;

    const { limit, skip } = this.paginationService.getSkipAndLimit(
      Number(page),
      Number(perPage),
    );

    const today = new Date();

    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      0,
      0,
      0,
      0,
    );

    console.log(startOfToday);

    const auctions = await this.prismaService.auction.findMany({
      where: {
        status: AuctionStatus.IN_SCHEDULED,
        startDate: { gte: startOfToday },
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
        endDate: true,
        isBuyNowAllowed: true,
        startBidAmount: true,
        startDate: true,
        locationId: true,
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
          },
        },
        _count: { select: { bids: true } },
      },
      skip: skip,
      take: limit,
    });

    const auctionsCount = await this.prismaService.auction.count({
      where: {
        status: AuctionStatus.IN_SCHEDULED,
        startDate: { gte: new Date() },
      },
    });

    const pagination = this.paginationService.getPagination(
      auctionsCount,
      page,
      perPage,
    );

    if (roles.includes(Role.User)) {
      const savedAuctions =
        await this.auctionsHelper._injectIsSavedKeyToAuctionsList(
          userId,
          auctions,
        );
      return {
        auctions: this.auctionsHelper._injectIsMyAuctionKeyToAuctionsList(
          userId,
          savedAuctions,
        ),
        pagination,
      };
    }

    return {
      auctions,
      pagination,
    };
  }

  async findSponseredAuctions(roles: Role[], userId?: number) {
    const auctions = await this.prismaService.auction.findMany({
      where: {
        status: AuctionStatus.ACTIVE,
        isBuyNowAllowed: true,
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
        endDate: true,
        isBuyNowAllowed: true,
        startBidAmount: true,
        startDate: true,
        locationId: true,
        product: {
          select: {
            id: true,
            title: true,
            description: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
          },
        },
        _count: { select: { bids: true } },
      },
      orderBy: { startBidAmount: 'desc' },
      take: 4,
    });
    if (roles.includes(Role.User)) {
      return this.auctionsHelper._injectIsMyAuctionKeyToAuctionsList(
        userId,
        auctions,
      );
    }

    return auctions;
  }

  async findOwnerAuctionByIdOr404(auctionId: number) {
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
        user: { select: { lang: true } },
        location: {
          include: { city: true, country: true },
        },
        _count: { select: { bids: true } },
      },
    });

    if (!auction)
      throw new NotFoundResponse({
        ar: 'لا يوجد هذا الاعلان',
        en: 'Auction Not Found',
      });

    const formatedAuction = this.auctionsHelper._reformatAuctionObject(
      auction.user.lang,
      auction,
    );

    const resultAuction = await this.auctionsHelper._injectIsSavedKeyToAuction(
      auction.userId,
      formatedAuction,
    );
    const isAuctionHasBidders = await this._isAuctionHasBidders(auctionId);

    return {
      ...resultAuction,
      hasBids: isAuctionHasBidders,
      latestBidAmount: isAuctionHasBidders
        ? await this._findLatestBidForAuction(auctionId)
        : undefined,
    };
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
            category: true,
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
        _count: { select: { bids: true } },
      },
    });

    if (!auction)
      throw new NotFoundResponse({
        ar: 'لا يوجد هذا الاعلان',
        en: 'Auction Not Found',
      });

    const formatedAuction = this.auctionsHelper._reformatAuctionObject(
      auction.user.lang,
      auction,
    );

    if (roles.includes(Role.User)) {
      if (Number(formatedAuction.userId) === Number(userId)) {
        formatedAuction['isMyAuction'] = true;
      } else {
        formatedAuction['isMyAuction'] = false;
      }

      const savedAuction = await this.auctionsHelper._injectIsSavedKeyToAuction(
        userId,
        formatedAuction,
      );
      const isAuctionHasBidders = await this._isAuctionHasBidders(auctionId);

      return {
        ...savedAuction,
        hasBids: isAuctionHasBidders,
        latestBidAmount: isAuctionHasBidders
          ? await this._findLatestBidForAuction(auctionId)
          : undefined,
      };
    }

    const isAuctionHasBidders = await this._isAuctionHasBidders(auctionId);

    return {
      ...formatedAuction,
      hasBids: isAuctionHasBidders,
      latestBidAmount: isAuctionHasBidders
        ? await this._findLatestBidForAuction(auctionId)
        : undefined,
    };
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

  async viewAuctionBides(auctionId: number) {}

  async payForAuction(userId: number, auctionId: number) {
    await this.auctionsHelper._isAuctionOwner(userId, auctionId);

    const auction = await this.checkAuctionExistanceAndReturn(auctionId);
    switch (auction.durationUnit) {
      case DurationUnits.DAYS:
        if (auction.type === AuctionType.ON_TIME || !auction.startDate) {
          // Set ON_TIME Daily auction ACTIVE
          const today = new Date();
          const expiryDate = this.addDays(new Date(), auction.durationInDays);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              startDate: today,
              expiryDate: expiryDate,
            },
          });
        } else if (
          auction.type === AuctionType.SCHEDULED ||
          auction.startDate
        ) {
          // Set Schedule Daily auction ACTIVE
          const startDate = auction.startDate;
          const expiryDate = this.addDays(startDate, auction.durationInDays);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              expiryDate: expiryDate,
            },
          });
        }
        break;

      case DurationUnits.HOURS:
        if (auction.type === AuctionType.ON_TIME || !auction.startDate) {
          // Set ON_TIME hours auction ACTIVE
          const today = new Date();
          const expiryDate = this.addHours(new Date(), auction.durationInHours);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              startDate: today,
              expiryDate: expiryDate,
            },
          });
        } else if (
          auction.type === AuctionType.SCHEDULED ||
          auction.startDate
        ) {
          // Set Schedule hours auction ACTIVE
          const startDate = auction.startDate;
          const expiryDate = this.addHours(startDate, auction.durationInHours);

          await this.prismaService.auction.update({
            where: { id: auctionId },
            data: {
              status: AuctionStatus.ACTIVE,
              expiryDate: expiryDate,
            },
          });
        }
    }
  }

  addHours(date: Date, hours: number) {
    const newDate = new Date(date.getTime() + hours * 60 * 60 * 1000);
    return newDate;
  }

  addDays(date: Date, days: number) {
    const currentDate = date;
    const newDate = new Date(currentDate.setDate(currentDate.getDate() + days));
    return newDate;
  }

  async submitBidForAuction(
    userId: number,
    auctionId: number,
    bidAmount: number,
  ) {
    // Validate auction expiration
    const auction = await this._checkAuctionExpiredOrReturn(auctionId);

    // Check authorization
    if (auction.userId === userId)
      throw new MethodNotAllowedResponse({
        ar: 'هذا الاعلان من احد إعلاناتك',
        en: 'This auction is one of your created auctions',
      });

    // Validate CurrentBidAmount with bidAmount if there is no bidders else validate with latest bidAmount
    let latestBidAmount: Decimal;
    const isAuctionHasBidders = await this._isAuctionHasBidders(auctionId);
    if (isAuctionHasBidders) {
      latestBidAmount = await this._findLatestBidForAuction(auctionId);
      if (latestBidAmount >= new Prisma.Decimal(bidAmount))
        throw new MethodNotAllowedResponse({
          ar: 'قم برفع السعر',
          en: 'Bid Amount Must Be Greater Than Current Amount',
        });
    } else {
      latestBidAmount = auction.startBidAmount;
      if (latestBidAmount >= new Prisma.Decimal(bidAmount))
        throw new MethodNotAllowedResponse({
          ar: 'قم برفع السعر',
          en: 'Bid Amount Must Be Greater Than Current Amount',
        });
    }

    // Create new bid
    await this.prismaService.bids.create({
      data: { userId, auctionId, amount: bidAmount },
    });

    // Get totalBids after my bid
    const totalBids = await this.prismaService.bids.count({
      where: { auctionId },
    });

    // emit to all biders using socket instance
    await this.bidsWebSocketGateway.userSubmitBidEventHandler(
      auctionId,
      new Prisma.Decimal(bidAmount),
      totalBids,
    );
  }

  async findAllAuctionBidders(auctionId: number) {
    return await this.prismaService.$queryRawUnsafe(`
    SELECT "U"."id", "U"."userName", MAX(CAST("B"."amount" AS DECIMAL)) AS "lastBidAmount", MAX("B"."createdAt") AS "lastBidTime", "C"."totalBids"
    FROM "User" AS "U"
    LEFT JOIN "Bids" AS "B"
    ON "U"."id" = "B"."userId" AND "B"."auctionId" = ${auctionId}
    INNER JOIN (
    SELECT "Bids"."userId",  CAST(COUNT(*) AS INTEGER) AS "totalBids"
    FROM "Bids"
    WHERE "Bids"."auctionId" = ${auctionId}
    GROUP BY "Bids"."userId"
    ) AS "C"
    ON "U"."id" = "C"."userId"
    GROUP BY "U"."id", "U"."userName", "C"."totalBids"
    `);
  }

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
  private async _updateOnTimeDailyAuction(
    auctionId: number,
    userId: number,
    productId: number,
    auctionCreationDTO: AuctionCreationDTO,
  ) {
    const {
      type,
      durationUnit,
      durationInDays,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      locationId,
    } = auctionCreationDTO;

    let auction: Auction;
    try {
      auction = await this.prismaService.auction.update({
        where: { id: auctionId },
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
          status: AuctionStatus.PENDING_OWNER_DEPOIST,
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

  async findAuctionBidsHistoryForUser(auctionId: number, userId: number) {
    const bidderInfo = await this.prismaService.user.findUnique({
      where: { id: userId },
    });
    return {
      biderInfo: {
        imageLink: bidderInfo.imageLink,
        imagePath: bidderInfo.imagePath,
        userName: bidderInfo.userName,
      },
      bidsHistory: await this.prismaService.bids.findMany({
        where: { auctionId, userId },
        orderBy: { createdAt: 'asc' },
      }),
    };
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

  private async _updateOnTimeHoursAuction(
    auctionId: number,
    userId: number,
    productId: number,
    auctionCreationDTO: AuctionCreationDTO,
  ) {
    const {
      type,
      durationUnit,
      durationInHours,
      startBidAmount,
      isBuyNowAllowed,
      acceptedAmount,
      locationId,
    } = auctionCreationDTO;

    let auction: Auction;

    try {
      auction = await this.prismaService.auction.update({
        where: { id: auctionId },
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
          status: AuctionStatus.PENDING_OWNER_DEPOIST,
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

  async deleteAuctionImage(auctionId: number, imageId: number) {
    await this.auctionsHelper._isAuctionValidForUpdate(auctionId);

    await this.auctionsHelper._isImageRelatedToAuction(auctionId, imageId);
    try {
      await this.prismaService.image.delete({ where: { id: imageId } });
    } catch (error) {
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في عملية حذف الصورة',
        en: 'Something went wrong while deleting your image',
      });
    }
  }

  async uploadImageForAuction(auctionId: number, image: Express.Multer.File) {
    // Check auction validation for update
    await this.auctionsHelper._isAuctionValidForUpdate(auctionId);

    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
      include: { product: { include: { images: true } } },
    });

    // Check auction images validation
    if (auction.product.images.length >= 5)
      throw new MethodNotAllowedResponse({
        ar: 'لا يمكنك إضافة الصورة',
        en: 'You Can Not Upload Image, You have been uploaded 5 images',
      });

    try {
      // Upload Image to firebase
      const { filePath, fileLink } = await this.firebaseService.uploadImage(
        image,
      );
      // Upload new image
      await this.prismaService.image.create({
        data: {
          imageLink: fileLink,
          imagePath: filePath,
          productId: auction.productId,
        },
      });
    } catch (error) {
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في عملية رفع الصورة',
        en: 'Something went wrong while uploading your image',
      });
    }
  }

  async markExpiredAuctions() {
    const expiredAuctions = await this.prismaService.auction.findMany({
      where: {
        expiryDate: {
          lte: new Date(), // Filter auctions where expiryDate is less than or equal to the current date and time
        },
        status: {
          not: AuctionStatus.EXPIRED, // Exclude auctions that are already marked as expired
        },
      },
    });

    for (const auction of expiredAuctions) {
      await this.prismaService.auction.update({
        where: {
          id: auction.id,
        },
        data: {
          status: AuctionStatus.EXPIRED, // Update the status of the auction to 'EXPIRED'
          endDate: new Date(), // Set the endDate to the current date and time
        },
      });
    }
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

  private async _updateScheduleDailyAuction(
    auctionId: number,
    userId: number,
    productId: number,
    auctionCreationDTO: AuctionCreationDTO,
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
    } = auctionCreationDTO;

    let auction: Auction;

    try {
      auction = await this.prismaService.auction.update({
        where: { id: auctionId },
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
          status: AuctionStatus.PENDING_OWNER_DEPOIST,
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

  private async _updateScheduleHoursAuction(
    auctionId: number,
    userId: number,
    productId: number,
    auctionCreationDTO: AuctionCreationDTO,
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
    } = auctionCreationDTO;

    let auction: Auction;

    try {
      auction = await this.prismaService.auction.update({
        where: { id: auctionId },
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
          status: AuctionStatus.PENDING_OWNER_DEPOIST,
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

  private async _updateProduct(productId: number, productBody: ProductDTO) {
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

    let updatedProduct: Product;
    try {
      updatedProduct = await this.prismaService.product.update({
        where: { id: productId },
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

    return updatedProduct.id;
  }

  async _checkAuctionExpiredOrReturn(auctionId: number) {
    const auction = await this.checkAuctionExistanceAndReturn(auctionId);
    if (auction.status === AuctionStatus.EXPIRED)
      throw new MethodNotAllowedResponse({
        en: 'Auction has been Expired',
        ar: 'تم غلق الاعلان',
      });

    return auction;
  }

  async _isAuctionHasBidders(auctionId: number) {
    const hasBidders = await this.prismaService.bids.findFirst({
      where: { auctionId },
    });
    if (!hasBidders) return false;

    return true;
  }

  async _findLatestBidForAuction(auctionId: number) {
    const latestBid = await this.prismaService.bids.findMany({
      where: { auctionId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    return latestBid[0].amount;
  }
}
