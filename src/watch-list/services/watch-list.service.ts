import { Injectable } from '@nestjs/common';
import { MethodNotAllowedResponse } from 'src/common/errors';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class WatchListService {
  constructor(private prismaService: PrismaService) {}

  async addToWatchList(userId: number, auctionId?: number, productId?: number) {
    // Check if already added
    const isAlreadySaved = await this._isAlreadySavedOrNull(
      userId,
      auctionId,
      productId,
    );
    if (isAlreadySaved)
      throw new MethodNotAllowedResponse({
        ar: 'تم حفظة من قبل',
        en: 'Item Is Already Saved',
      });

    try {
      // Add to watch-list
      return await this.prismaService.watchList.create({
        data: {
          userId,
          auctionId,
          productId,
        },
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'هناك خطأ في حفظ الاعلان تأكد من صحة وجود الاعلان',
        en: 'Something Went Wrong While Saving Item',
      });
    }
  }

  async removeFromWatchList(
    userId: number,
    auctionId?: number,
    productId?: number,
  ) {
    // Check if already added
    const isAlreadySaved = await this._isAlreadySavedOrNull(
      userId,
      auctionId,
      productId,
    );
    if (!isAlreadySaved)
      throw new MethodNotAllowedResponse({
        ar: 'هذا الاعلان ليس في محفوظاتك',
        en: 'Item Is Not In Your WatchList',
      });

    // Remove from watchList
    await this.prismaService.watchList.deleteMany({
      where: { userId, auctionId, productId },
    });
  }

  async findAllWatchList(userId: number) {
    return await this.prismaService.watchList.findMany({
      where: { userId },
      include: {
        auction: {
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
            bids: {
              orderBy: {
                createdAt: 'desc',
              },
            },
            _count: { select: { bids: true } },
          },
        },
        product: {
          select: {
            id: true,
            title: true,
            categoryId: true,
            subCategoryId: true,
            brandId: true,
            images: true,
            ProductListingPrice: true,
            usageStatus: true,
            listedProducts: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });
  }

  private async _isAlreadySavedOrNull(
    userId: number,
    auctionId?: number,
    productId?: number,
  ) {
    return await this.prismaService.watchList.findFirst({
      where: {
        userId,
        auctionId,
        productId,
      },
    });
  }
}
