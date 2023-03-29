import { Injectable } from '@nestjs/common';
import { MethodNotAllowedResponse } from 'src/common/errors';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class WatchListService {
  constructor(private prismaService: PrismaService) {}

  async addToWatchList(userId: number, auctionId: number) {
    // Check if already added
    const isAlreadySaved = await this._isAlreadySavedOrNull(userId, auctionId);
    if (isAlreadySaved)
      throw new MethodNotAllowedResponse({
        ar: 'تم حفظة من قبل',
        en: 'Auction Is Already Saved',
      });

    try {
      // Add to watch-list
      return await this.prismaService.watchList.create({
        data: {
          userId,
          auctionId,
        },
      });
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'هناك خطأ في حفظ الاعلان تأكد من صحة وجود الاعلان',
        en: 'Something Went Wrong While Saved Auction, It Maybe NotFound',
      });
    }
  }

  async removeFromWatchList(userId: number, auctionId: number) {
    // Check if already added
    const isAlreadySaved = await this._isAlreadySavedOrNull(userId, auctionId);
    if (!isAlreadySaved)
      throw new MethodNotAllowedResponse({
        ar: 'هذا الاعلان ليس في محفوظاتك',
        en: 'Auction Is Not In Your WatchList',
      });

    // Remove from watchList
    await this.prismaService.watchList.deleteMany({
      where: { userId, auctionId },
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
          },
        },
      },
    });
  }

  private async _isAlreadySavedOrNull(userId: number, auctionId: number) {
    return await this.prismaService.watchList.findFirst({
      where: {
        userId,
        auctionId,
      },
    });
  }
}
