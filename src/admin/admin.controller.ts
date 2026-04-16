import { Controller, Get, Query, Delete, Param, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('admin')
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('products/search')
  async searchProducts(@Query('query') query: string) {
    return {
      success: true,
      data: await this.adminService.searchProducts(query),
    };
  }

  @Delete('comments/:id')
  async deleteComment(@Param('id') id: string) {
    return {
      success: true,
      data: await this.adminService.deleteComment(+id),
    };
  }
}
