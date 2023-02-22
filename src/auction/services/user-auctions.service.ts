import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationService } from '../../common/services/pagination.service';

@Injectable()
export class UserAuctionsService {
  constructor(
    private prismaService: PrismaService,
    private paginationService: PaginationService,
  ) {}

  async createAuction() {}
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
}
