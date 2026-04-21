import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import {
  CreateBugReportDTO,
  UpdateBugReportStatusDTO,
} from './dtos/create-bug-report.dto';
import { ProblemStatus } from '@prisma/client';
import { NotificationGateway } from '../notificatons/notifications.gateway';
import { NotificationsService } from '../notificatons/notifications.service';

@Injectable()
export class BugReportService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly firebaseService: FirebaseService,
    private readonly notificationGateway: NotificationGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createBugReport(
    userId: number | undefined,
    createBugReportDto: CreateBugReportDTO,
    files: Express.Multer.File[],
  ) {
    const { description, email } = createBugReportDto;

    const bugReport = await this.prismaService.bugReport.create({
      data: {
        userId,
        email,
        description,
        status: ProblemStatus.PENDING,
        unreadCount: 1,
      },
    });

    if (files && files.length > 0) {
      const mediaUrls = await Promise.all(
        files.map(async (file) => {
          return await this.firebaseService.uploadImage(file);
        }),
      );

      await this.prismaService.bugReportImages.createMany({
        data: mediaUrls.map((mediaUrl) => ({
          bugReportId: bugReport.id,
          imagePath: mediaUrl.filePath,
          imageLink: mediaUrl.fileLink,
        })),
      });
    }

    const finalReport = await this.prismaService.bugReport.findUnique({
      where: { id: bugReport.id },
      include: { images: true, user: { select: { id: true, userName: true } } },
    });

    this.notificationGateway.broadcastToAdmins('new_bug_report', finalReport);

    return finalReport;
  }

  async getAllBugReports() {
    return this.prismaService.bugReport.findMany({
      include: {
        images: true,
        user: {
          select: {
            id: true,
            userName: true,
            email: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getUserBugReports(userId: number) {
    return this.prismaService.bugReport.findMany({
      where: { userId },
      include: {
        images: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBugReportById(id: number, userId?: number, isAdmin = false) {
    const bugReport = await this.prismaService.bugReport.findUnique({
      where: { id },
      include: {
        images: true,
        user: {
          select: {
            id: true,
            userName: true,
            email: true,
            phone: true,
            imageLink: true,
          },
        },
        messages: {
          include: {
            user: {
              select: {
                id: true,
                userName: true,
                imageLink: true,
              },
            },
            admin: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!bugReport) {
      throw new NotFoundException('Bug report not found');
    }

    if (!isAdmin && bugReport.userId !== userId) {
      throw new NotFoundException('Bug report not found');
    }

    if (isAdmin) {
      await this.prismaService.bugReport.update({
        where: { id },
        data: { unreadCount: 0 },
      });
    } else {
      await this.prismaService.bugReport.update({
        where: { id },
        data: { userUnreadCount: 0 },
      });
    }

    return bugReport;
  }

  async addBugReportMessage(
    reportId: number,
    content: string,
    userId?: number,
    adminId?: number,
  ) {
    const bugReport = await this.prismaService.bugReport.findUnique({
      where: { id: reportId },
    });

    if (!bugReport) {
      throw new NotFoundException('Bug report not found');
    }

    const message = await this.prismaService.bugReportMessage.create({
      data: {
        bugReportId: reportId,
        message: content,
        userId: userId || null,
        adminId: adminId || null,
      },
      include: {
        user: {
          select: {
            id: true,
            userName: true,
            imageLink: true,
          },
        },
        admin: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    this.notificationGateway.sendBugReportMessage(
      reportId,
      message,
      adminId ? bugReport.userId : undefined,
    );

    if (userId) {
      await this.prismaService.bugReport.update({
        where: { id: reportId },
        data: { unreadCount: { increment: 1 } },
      });

      this.notificationGateway.broadcastToAdmins(
        'new_bug_report_message_global',
        message,
      );
    } else if (adminId) {
      await this.prismaService.bugReport.update({
        where: { id: reportId },
        data: { unreadCount: 0, userUnreadCount: { increment: 1 } },
      });

      // Send formal notification to the user
      if (bugReport.userId) {
        try {
          const firstImage = await this.prismaService.bugReportImages.findFirst({
            where: { bugReportId: reportId },
            select: { imageLink: true },
          });

          await this.notificationsService.sendNotifications(
            [bugReport.userId.toString()],
            `Admin replied to your bug report: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`,
            firstImage?.imageLink || '',
            'Bug Report Update',
            undefined, // auctionId
            false, // isBidders
            undefined, // productId
          );
        } catch (error) {
          console.error('[BugReportService] Failed to send formal notification:', error);
        }
      }
    }

    return message;
  }

  async updateBugReportStatus(id: number, updateDto: UpdateBugReportStatusDTO) {
    const bugReport = await this.prismaService.bugReport.findUnique({
      where: { id },
    });

    if (!bugReport) {
      throw new NotFoundException('Bug report not found');
    }

    return this.prismaService.bugReport.update({
      where: { id },
      data: { status: updateDto.status },
    });
  }
}
