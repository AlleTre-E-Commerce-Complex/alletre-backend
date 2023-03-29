import { Injectable } from '@nestjs/common';
import { Auction, AuctionStatus } from '@prisma/client';
import { ForbiddenResponse, MethodNotAllowedResponse } from 'src/common/errors';
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
  }

  _productFilterApplied({ brands, categories, usageStatus, title }) {
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

  async _injectIsSavedKeyToAuctionsList(userId: number, auctions: Auction[]) {
    // Get saved auctions
    const savedAuctions = await this.prismaService.watchList.findMany({
      where: { userId: Number(userId) },
    });

    // Get saved auctionsIs
    const savedAuctionsIds = savedAuctions.map((savedAuction) => {
      return savedAuction.auctionId;
    });

    // Inject key
    return auctions.map((auction) => {
      auction['isSaved'] = savedAuctionsIds.includes(auction.id);
      return auction;
    });
  }
  async _injectIsSavedKeyToAuction(userId: number, auction: Auction) {
    // Get saved auctions
    const savedAuctions = await this.prismaService.watchList.findMany({
      where: { userId: Number(userId) },
    });

    // Get saved auctionsIs
    const savedAuctionsIds = savedAuctions.map((savedAuction) => {
      return savedAuction.auctionId;
    });

    // Inject key
    auction['isSaved'] = savedAuctionsIds.includes(auction.id);
    return auction;
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
