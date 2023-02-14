import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UserAuctionsService {
  constructor(private prismaService: PrismaService) {}

  async createAuction() {}
  async findOwnesAuctions(userId: number) {}
  async findAuctionsForUser() {}
  async findAuctionsForGuest() {}
  async findAuctionById(auctionId: number) {}
  async updateAuctionById(userId: number, auctionId: number) {}
}
