import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from '../services/dashboard.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../auth/enums/role.enum';

@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('/admin/stats')
  @UseGuards(AuthGuard)
  @Roles(Role.Admin)
  async getDashboardStats() {
    const stats = await this.dashboardService.getDashboardStats();
    return {
      success: true,
      data: stats,
    };
  }
}
