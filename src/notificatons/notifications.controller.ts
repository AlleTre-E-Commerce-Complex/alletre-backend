import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { Account } from 'src/auth/decorators/account.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // Endpoint to handle subscription
  @Post('/subscribe')
  @UseGuards(AuthGuard)
  async subscribe(
    @Account() account: any,
    @Body('subscription') subscription: any,
  ) {
    if (!subscription) {
      return { success: false, message: 'Invalid subscription object' };
    }

    await this.notificationsService.saveSubscription(account.id, subscription);
    return { success: true, message: 'Subscription saved successfully!' };
  }

  // Endpoint to send notifications
  // @Post('/send-notification')
  // @UseGuards(AuthGuard)
  // async sendNotification(@Body() body: { title: string; content: string }) {
  //   const { title, content } = body;

  //   if (!title || !content) {
  //     return { success: false, message: 'Title and content are required' };
  //   }

  //   const result = await this.notificationsService.sendNotificationsToAll(
  //     title,
  //     content,
  //   );
  //   return { success: result.success, message: result.message };
  // }

  @Get('/get/all')
  @UseGuards(AuthGuard)
  async getAllNotifications(@Account() account: any) {
    return {
      success: true,
      data: await this.notificationsService.getAllNotifications(account.id),
    };
  }
}
