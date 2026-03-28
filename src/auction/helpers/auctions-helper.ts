import { Injectable } from '@nestjs/common';
import { Auction, AuctionStatus } from '@prisma/client';
import {
  ForbiddenResponse,
  MethodNotAllowedResponse,
  NotFoundResponse,
} from 'src/common/errors';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuctionsHelper {
  constructor(private prismaService: PrismaService) {}

  async _userHasCompleteProfile(userId: number) {
    const user = await this.prismaService.user.findUnique({
      where: { id: Number(userId) },
    });

    if (!user.hasCompletedProfile)
      throw new MethodNotAllowedResponse({
        ar: 'اكمل بياناتك',
        en: 'Complete your profile',
      });
    return user;
  }

  _productFilterApplied(filters: any) {
    const {
      brand,
      brands,
      model,
      categories,
      subCategory,
      usageStatus,
      title,
      regionalSpecs,
      bodyType,
      seatingCapacity,
      transmissionType,
      fuelType,
      exteriorColor,
      interiorColor,
      horsepower,
      engineCapacity,
      doors,
      warranty,
      cylinders,
      propertyType,
      amenities,
      bedrooms,
      bathrooms,
      furnished,
      minYear,
      maxYear,
      minKilometer,
      maxKilometer,
      minSqft,
      maxSqft,
      emirate,
    } = filters;
    let productFilterOrSearch = {};

    if (title && title.length) {
      productFilterOrSearch = {
        ...productFilterOrSearch,
        ...{ title: { startsWith: title, mode: 'insensitive' } },
      };
    }
    if (categories?.length) {
      productFilterOrSearch = {
        ...productFilterOrSearch,
        ...{ categoryId: { in: categories } },
      };

      if (subCategory?.length) {
        productFilterOrSearch = {
          ...productFilterOrSearch,
          ...{ subCategoryId: { in: subCategory } },
        };
      }
    }
    if (subCategory?.length) {
      productFilterOrSearch = {
        ...productFilterOrSearch,
        ...{ subCategoryId: { in: subCategory } },
      };
    }
    if (brands?.length || brand?.length) {
      productFilterOrSearch = {
        ...productFilterOrSearch,
        ...{ brand: { in: [...(brands || []), ...(brand || [])] } },
      };
    }
    if (model?.length) {
      productFilterOrSearch = {
        ...productFilterOrSearch,
        ...{ model: { in: model } },
      };
    }
    if (usageStatus?.length) {
      productFilterOrSearch = {
        ...productFilterOrSearch,
        ...{ usageStatus: { in: usageStatus } },
      };
    }

    if (regionalSpecs?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        regionalSpecs: { in: regionalSpecs },
      };
    if (bodyType?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        carType: { in: bodyType },
      };
    if (seatingCapacity?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        seatingCapacity: { in: seatingCapacity },
      };
    if (transmissionType?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        transmissionType: { in: transmissionType },
      };
    if (fuelType?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        fuelType: { in: fuelType },
      };
    if (exteriorColor?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        exteriorColor: { in: exteriorColor },
      };
    if (interiorColor?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        interiorColor: { in: interiorColor },
      };
    if (horsepower?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        horsepower: { in: horsepower },
      };
    if (engineCapacity?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        engineCapacity: { in: engineCapacity },
      };
    if (doors?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        doors: { in: doors },
      };
    if (warranty?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        warranty: { in: warranty },
      };
    if (cylinders?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        numberOfCylinders: { in: cylinders },
      };

    if (propertyType && propertyType.length) {
      const cleanPropertyType = propertyType.map((pt) =>
        typeof pt === 'string' ? pt.split(':')[0] : pt,
      );
      productFilterOrSearch = {
        ...productFilterOrSearch,
        OR: [
          { residentialType: { in: cleanPropertyType } },
          { commercialType: { in: cleanPropertyType } },
          { landType: { in: cleanPropertyType } },
        ],
      };
    }
    if (amenities?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        amenities: { in: amenities },
      };
    if (bedrooms?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        numberOfRooms: { in: bedrooms },
      };
    if (bathrooms?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        numberOfBathrooms: { in: bathrooms },
      };
    if (furnished?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        isFurnished: { in: furnished },
      };

    if (minYear || maxYear) {
      productFilterOrSearch = {
        ...productFilterOrSearch,
        releaseYear: {
          ...(minYear ? { gte: String(minYear) } : {}),
          ...(maxYear ? { lte: String(maxYear) } : {}),
        },
      };
    }
    if (emirate?.length)
      productFilterOrSearch = {
        ...productFilterOrSearch,
        emirate: { in: emirate },
      };
    if (minKilometer || maxKilometer) {
      productFilterOrSearch = {
        ...productFilterOrSearch,
        kilometers: {
          ...(minKilometer ? { gte: String(minKilometer) } : {}),
          ...(maxKilometer ? { lte: String(maxKilometer) } : {}),
        },
      };
    }
    if (minSqft || maxSqft) {
      productFilterOrSearch = {
        ...productFilterOrSearch,
        totalArea: {
          ...(minSqft ? { gte: Number(minSqft) } : {}),
          ...(maxSqft ? { lte: Number(maxSqft) } : {}),
        },
      };
    }

    return productFilterOrSearch;
  }

  async _injectIsSavedKeyToAuctionsList(userId: number, auctions: any[]) {
    // Get saved items for this user
    const watchList = await this.prismaService.watchList.findMany({
      where: { userId: Number(userId) },
    });

    const savedAuctionsIds = watchList
      .filter((item) => item.auctionId)
      .map((item) => item.auctionId);

    // Inject key
    return auctions.map((auction) => {
      auction['isSaved'] = savedAuctionsIds.includes(auction.id);
      return auction;
    });
  }

  async _injectIsSavedKeyToListedProductsList(
    userId: number,
    listedProducts: any[],
  ) {
    // Get saved items for this user
    const watchList = await this.prismaService.watchList.findMany({
      where: { userId: Number(userId) },
    });

    const savedProductsIds = watchList
      .filter((item) => item.productId)
      .map((item) => item.productId);

    // Inject key
    return listedProducts.map((lp) => {
      lp['isSaved'] = savedProductsIds.includes(lp.productId);
      return lp;
    });
  }

  async _injectIsSavedKeyToAuction(userId: number, auction: any) {
    const watchList = await this.prismaService.watchList.findFirst({
      where: { userId: Number(userId), auctionId: auction.id },
    });
    auction['isSaved'] = !!watchList;
    return auction;
  }

  async _injectIsSavedKeyToListedProduct(userId: number, listedProduct: any) {
    const watchList = await this.prismaService.watchList.findFirst({
      where: { userId: Number(userId), productId: listedProduct.productId },
    });
    listedProduct['isSaved'] = !!watchList;
    return listedProduct;
  }
  _injectIsMyAuctionKeyToAuctionsList(userId: number, auctions: Auction[]) {
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
  _auctionFilterApplied({ priceFrom, priceTo, countries, sellingType }) {
    let auctionFilterOrSearch = {};

    if (priceFrom || priceTo) {
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

  async _checkAuctionExistanceOr404(auctionId: number) {
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction)
      throw new NotFoundResponse({
        ar: 'لا يوجد هذا الاعلان',
        en: 'Auction Not Found',
      });
  }

  async _getAuctionCategory(auctionId: number) {
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
      include: {
        product: {
          include: { category: true },
        },
      },
    });
    return auction?.product?.category;
  }

  async _isAuctionOwner(userId: number, auctionId: number) {
    const auction = await this.prismaService.auction.findFirst({
      where: { id: Number(auctionId), userId: Number(userId) },
    });

    if (!auction)
      throw new ForbiddenResponse({
        ar: 'ليس لديك صلاحيات لهذا الاعلان',
        en: 'You have no authorization for accessing this resource',
      });
  }

  async _auctionCanBeDeletedByOwner(auctionId: number) {
    const auction = await this.prismaService.auction.findFirst({
      where: { id: auctionId },
    });

    if (auction.status !== AuctionStatus.DRAFTED)
      throw new ForbiddenResponse({
        ar: 'لا يمكنك حذف الاعلان',
        en: 'Auction Can Not Be Deleted',
      });
  }

  _execludeNullFields(auction: Auction) {
    for (const field in auction['product']) {
      if (auction['product'][field] === null) delete auction['product'][field];
    }

    return auction;
  }

  _reformatAuctionObject(userLang: string, auction: Auction) {
    // if (auction['product']['brand']) {
    //   const brandName = auction['product']['brand']['name'];
    //   delete auction['product']['brand'];
    //   auction['product']['brand'] = brandName;
    // }
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
    // delete auction['user'];

    return this._execludeNullFields(auction);
  }

  async _isImageRelatedToAuction(auctionId: number, imageId: number) {
    const image = await this.prismaService.image.findUnique({
      where: { id: imageId },
    });
    if (!image)
      throw new NotFoundResponse({
        ar: 'هذه الصورة غير مسجلة',
        en: 'Image Not Found',
      });

    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
      include: { product: { include: { images: true } } },
    });
    const auctionImagesIds = auction.product.images.map((image) => {
      return image.id;
    });

    // if (!auctionImagesIds.includes(imageId) )
    //   throw new MethodNotAllowedResponse({
    //     ar: 'هذه الصورة غير تابعة لهذا الاعلان',
    //     en: 'Image is not related to Auction',
    //   });
  }

  async _isAuctionValidForUpdate(auctionId: number) {
    const auction = await this.prismaService.auction.findUnique({
      where: { id: auctionId },
    });
    if (!auction) {
      throw new NotFoundResponse({
        ar: 'الاعلان غير موجود',
        en: 'Auction Not Found',
      });
    }
  }
}
