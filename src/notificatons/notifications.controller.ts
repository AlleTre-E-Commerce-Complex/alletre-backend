import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  BadRequestException,
  Put,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { Account } from 'src/auth/decorators/account.decorator';

// Add DTO for type safety
class SaveFCMTokenDto {
  fcmToken: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('/save-token')
  @UseGuards(AuthGuard)
  async saveFCMToken(@Account() account: any, @Body() data: SaveFCMTokenDto) {
    if (!data.fcmToken) {
      throw new BadRequestException('FCM token is required');
    }

    try {
      await this.notificationsService.saveFCMToken(
        account.id.toString(),
        data.fcmToken,
      );

      return {
        success: true,
        message: 'FCM token saved successfully',
      };
    } catch (error) {
      console.error('Error saving FCM token:', error);
      throw new BadRequestException('Failed to save FCM token');
    }
  }

  @Get('/get/all')
  @UseGuards(AuthGuard)
  async getAllNotifications(@Account() account: any) {
    try {
      const notifications = await this.notificationsService.getAllNotifications(
        account.id,
      );

      return {
        success: true,
        data: notifications,
        unreadCount: notifications.filter((n) => !n.isRead).length,
      };
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw new BadRequestException('Failed to fetch notifications');
    }
  }

  // Add endpoint to mark notifications as read
  @Put('/mark-read')
  @UseGuards(AuthGuard)
  async markNotificationsAsRead(
    @Account() account: any,
    @Body('notificationIds') notificationIds: number[],
  ) {
    try {
      await this.notificationsService.markNotificationsAsRead(
        account.id,
        notificationIds,
      );

      return {
        success: true,
        message: 'Notifications marked as read',
      };
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      throw new BadRequestException('Failed to mark notifications as read');
    }
  }

  // Add endpoint to get unread count
  @Get('/unread-count')
  @UseGuards(AuthGuard)
  async getUnreadCount(@Account() account: any) {
    try {
      const count = await this.notificationsService.getUnreadNotificationCount(
        account.id,
      );
      console.log('count : ', count);
      return {
        success: true,
        count,
      };
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw new BadRequestException('Failed to get unread count');
    }
  }
}
