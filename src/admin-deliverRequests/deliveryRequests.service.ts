import { Injectable } from '@nestjs/common';
import { DeliveryRequestsStatus, DeliveryType } from '@prisma/client';
import { UserAuctionsService } from 'src/auction/services/user-auctions.service';
import { MethodNotAllowedResponse } from 'src/common/errors';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DeliveryRequestService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly userAuctionService: UserAuctionsService,
  ) {}

  async findDeliveryRequestsByAdmin(deliveryType: DeliveryType) {
    try {
      console.log('deliveryType :', deliveryType);
      const deliveryRequestData = await this.prismaService.payment.findMany({
        where: {
          status: 'SUCCESS',
          type: {
            in: ['AUCTION_PURCHASE', 'BUY_NOW_PURCHASE'], // Correct way to check for multiple values
          },
          auction: {
            deliveryType: deliveryType,
          },
        },
        include: {
          user: {
            include: { locations: { include: { country: true, city: true } } },
          },
          auction: {
            include: {
              location: { include: { country: true, city: true } },
              user: true,
              product: { include: { images: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        // skip:0,
        // take:5,
      });

      return deliveryRequestData;
    } catch (error) {
      console.log('Error at findDeliveryRequestsByAdmin:', error);
      throw new MethodNotAllowedResponse({
        ar: 'لايمكنك شراء المزاد',
        en: 'you cannot fetch the delivery request data',
      });
    }
  }
  async updateDeliveryRequestsByAdmin(
    requestId: string,
    status: DeliveryRequestsStatus,
  ) {
    try {
      console.log('request Id ', requestId, status);
      const updatedDeliveryRequestData =
        await this.prismaService.payment.update({
          where: {
            id: Number(requestId),
          },
          data: {
            auction: {
              update: {
                deliveryRequestsStatus: status,
              },
            },
          },
        });

      if (status === 'DELIVERY_SUCCESS') {
        await this.userAuctionService.confirmDelivery(
          updatedDeliveryRequestData.userId,
          updatedDeliveryRequestData.auctionId,
        );
      }

      return updatedDeliveryRequestData;
    } catch (error) {
      console.log('Error at findDeliveryRequestsByAdmin:', error);
      throw new MethodNotAllowedResponse({
        ar: 'لايمكنك شراء المزاد',
        en: 'error when updating the delivery request data',
      });
    }
  }
}
