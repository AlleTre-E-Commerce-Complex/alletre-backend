import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseIntPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { BugReportService } from './bug-report.service';
import {
  CreateBugReportDTO,
  UpdateBugReportStatusDTO,
} from './dtos/create-bug-report.dto';
import { AddBugReportMessageDTO } from './dtos/add-bug-report-message.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Account } from '../auth/decorators/account.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { AuthOrGuestGuard } from '../auth/guards/authOrGuest.guard';

@Controller('bug-report')
export class BugReportController {
  constructor(private readonly bugReportService: BugReportService) {}

  @Post('create')
  @UseGuards(AuthOrGuestGuard)
  @UseInterceptors(FilesInterceptor('images', 20, { dest: 'uploads/' }))
  async createBugReport(
    @Account() account: any,
    @Body() createBugReportDto: CreateBugReportDTO,
    @UploadedFiles() images: Array<Express.Multer.File>,
  ) {
    const userId = account?.id ? Number(account.id) : null;
    const bugReport = await this.bugReportService.createBugReport(
      userId,
      createBugReportDto,
      images,
    );
    return {
      success: true,
      data: bugReport,
    };
  }

  @Get('admin/all')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async getAllBugReports() {
    const bugReports = await this.bugReportService.getAllBugReports();
    return {
      success: true,
      data: bugReports,
    };
  }

  @Patch('admin/:id/status')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async updateBugReportStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateBugReportStatusDTO,
  ) {
    const updatedReport = await this.bugReportService.updateBugReportStatus(
      id,
      updateDto,
    );
    return {
      success: true,
      data: updatedReport,
    };
  }

  @Get('my-reports')
  @UseGuards(AuthGuard)
  async getMyBugReports(@Account() account: any) {
    const bugReports = await this.bugReportService.getUserBugReports(
      Number(account.id),
    );
    return {
      success: true,
      data: bugReports,
    };
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async getBugReportDetails(
    @Account() account: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const isAdmin = account.roles?.includes(Role.Admin);
    const bugReport = await this.bugReportService.getBugReportById(
      id,
      Number(account.id),
      isAdmin,
    );
    return {
      success: true,
      data: bugReport,
    };
  }

  @Post(':id/message')
  @UseGuards(AuthGuard)
  async addMessage(
    @Account() account: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() addMessageDto: AddBugReportMessageDTO,
  ) {
    const userId = account.roles?.includes(Role.User)
      ? Number(account.id)
      : undefined;
    const adminId = account.roles?.includes(Role.Admin)
      ? Number(account.id)
      : undefined;

    const message = await this.bugReportService.addBugReportMessage(
      id,
      addMessageDto.message,
      userId,
      adminId,
    );
    return {
      success: true,
      data: message,
    };
  }
}
