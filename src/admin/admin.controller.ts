import { Controller, Get, Query, Delete, Param, UseGuards, Patch, Body, ParseIntPipe, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { AdminProductUpdateDto } from './dtos/admin-product-update.dto';
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

  @Patch('products/:id/location')
  async updateProductLocation(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: AdminProductUpdateDto,
  ) {
    return {
      success: true,
      data: await this.adminService.updateProductLocation(id, updateDto),
    };
  }

  @Get('objections')
  async getObjections() {
    return {
      success: true,
      data: await this.adminService.getObjections(),
    };
  }

  @Patch('objections/:id/status')
  async updateObjectionStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
  ) {
    return {
      success: true,
      data: await this.adminService.updateObjectionStatus(id, status),
    };
  }

  @Patch('objections/:id/final-decision')
  @UseInterceptors(
    AnyFilesInterceptor({
      dest: 'uploads/',
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async submitFinalDecision(
    @Param('id', ParseIntPipe) id: number,
    @Body('finalDecision') finalDecision: string,
    @Body('payoutTo') payoutTo: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return {
      success: true,
      data: await this.adminService.submitFinalDecision(id, finalDecision, payoutTo, files || []),
    };
  }

  @Delete('objections/:id/final-decision')
  async deleteFinalDecision(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return {
      success: true,
      data: await this.adminService.deleteFinalDecision(id),
    };
  }

  @Delete('objections/final-decision-documents/:docId')
  async deleteFinalDecisionDocument(
    @Param('docId', ParseIntPipe) docId: number,
  ) {
    return {
      success: true,
      data: await this.adminService.deleteFinalDecisionDocument(docId),
    };
  }
}
