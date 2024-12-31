import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { WithdrawalService } from './withdrawal.service';

@Controller('withdrawalsRequests') // Base path for this controller
export class WithdrawalController {
  constructor(private readonly withdrawalService: WithdrawalService) {}

  @Get('admin/all') // This defines the endpoint /withdrawalsRequests/admin/all
  async getAllWithdrawalRequests() {
    return this.withdrawalService.getAllWithdrawalRequests();
  }
  @Put(':id/approve')
  async approveWithdrawalRequest(
    @Param('id') id: string, // Get the id from the URL
    @Body('withdrawalStatus') withdrawalStatus: string, // Get the withdrawalStatus as a string
  ) {
    console.log('Received ID for approval:', id);
    console.log('Received withdrawalStatus:', withdrawalStatus);

    // Optionally validate the withdrawalStatus to ensure it's one of the allowed values
    const validStatuses = ['PENDING', 'IN_PROGRESS', 'SUCCESS'];

    if (!validStatuses.includes(withdrawalStatus)) {
      throw new Error(`Invalid withdrawalStatus: ${withdrawalStatus}`);
    }

    // Convert id to number if necessary and pass both id and withdrawalStatus to the service
    return this.withdrawalService.approveWithdrawalRequest(
      Number(id),
      withdrawalStatus, // Now we are passing a string
    );
  }
}
