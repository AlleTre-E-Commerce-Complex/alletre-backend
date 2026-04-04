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
    const isListing = request.query?.isListing === 'true';
    console.log('auctionId from OwnerGuard = :', auctionId);
    console.log('isListing from OwnerGuard = :', isListing);

    let item: any;
    if (isListing) {
      item = await this.findProductByIdOr404(Number(auctionId));
    } else {
      item = await this.findAuctionByIdOr404(Number(auctionId));
    }

    if (item.userId !== Number(userId))
      throw new ForbiddenResponse({
        ar: 'ليس لديك صلاحيات لهذا الاعلان',
        en: 'You have no authorization for accessing this resource',
      });

    return true;
  }

  private async findProductByIdOr404(productId: number) {
    const product = await this.prismaService.product.findUnique({
      where: { id: productId },
    });
    if (!product)
      throw new NotFoundResponse({
        ar: 'هذا المنتج غير موجود',
        en: 'Product Not Found',
      });
    return product;
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
