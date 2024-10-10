import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenResponse, NotFoundResponse } from 'src/common/errors';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(private prismaService: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {

    const request = context.switchToHttp().getRequest();
    if (!request.account) return false;

    const userId = request.account?.id;
    const auctionId = request.params?.auctionId;
    console.log('auctionId from OwnerGuard = :',auctionId)
    // Check user with auctions authorization
    const auction = await this.findAuctionByIdOr404(Number(auctionId));

    if (auction.userId !== Number(userId))
      throw new ForbiddenResponse({
        ar: 'ليس لديك صلاحيات لهذا الاعلان',
        en: 'You have no authorization for accessing this resource',
      });

    return true;
  }

  private async findAuctionByIdOr404(auctionId: number) {
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
}
