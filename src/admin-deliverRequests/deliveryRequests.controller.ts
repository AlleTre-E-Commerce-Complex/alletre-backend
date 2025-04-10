import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { Role } from 'src/auth/enums/role.enum';
import { DeliveryRequestService } from './deliveryRequests.service';
import { DeliveryRequestsStatus, DeliveryType } from '@prisma/client';

@Controller('deliveryRequests')
export class DeliveryRequestController {
  constructor(
    private readonly deliveryRequestService: DeliveryRequestService,
  ) {}
  @Get('/admin/get-delivery-request')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async findDeliveryRequestsByAdmin(
    @Query('deliveryType') deliveryType: DeliveryType,
  ) {
    const deliveryRequestData =
      await this.deliveryRequestService.findDeliveryRequestsByAdmin(
        deliveryType,
      );

    return {
      success: true,
      data: deliveryRequestData,
    };
  }
  @Patch('/admin/update-delivery-request')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async updateDeliveryRequestsByAdmin(
    @Query('requestId') requestId: string,
    @Body('status') status: DeliveryRequestsStatus,
  ) {
    const deliveryRequestData =
      await this.deliveryRequestService.updateDeliveryRequestsByAdmin(
        requestId,
        status,
      );

    return {
      success: true,
      data: deliveryRequestData,
    };
  }
}
