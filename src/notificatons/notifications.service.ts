import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Worker } from 'worker_threads';
import * as path from 'path';
import * as webPush from 'web-push';
import { NotificationGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    private prismaService: PrismaService,
    private notificationGateway: NotificationGateway,
  ) {
    // Initialize VAPID keys
    webPush.setVapidDetails(
      'mailto:alletre.auctions@gmail.com', // Use your email here
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  }

  // Method for saving subscriptions to DB
  async saveSubscription(userId: string, subscription: any) {
    try {
      // Save the subscription to the database
      await this.prismaService.pushSubscription.create({
        data: {
          userId: Number(userId),
          subscription: JSON.stringify(subscription),
        },
      });
      console.log('Saved subscription for user:', userId);
    } catch (error) {
      console.log('Error saving subscription:', error);
      throw new InternalServerErrorException('Failed to save subscription');
    }
  }

  // // Method for sending notifications to a single user
  // async sendNotificationToUser(subscription: any, notification: any) {
  //   try {
  //     // Send the push notification to the user
  //     const payload = JSON.stringify(notification);
  //     await webPush.sendNotification(subscription, payload);
  //     console.log('Notification sent to user');
  //   } catch (error) {
  //     console.log('Error sending notification:', error);
  //     throw new InternalServerErrorException('Failed to send notification');
  //   }
  // }
  // Method for sending notifications to all users
  async sendNotificationsToAll(userId: string, notification: any) {
    try {
      console.log('Users to notify: ', userId);
      this.notificationGateway.sendNotificationToAll(notification);
    } catch (error) {
      console.log('Error sending notifications to all users: ', error);
    }
  }

  async getAllNotifications(userId: number) {
    try {
      console.log('userId : ', userId);
      const notifications = await this.prismaService.notification.findMany({
        where: {
          userId,
        },
      });
      console.log('notifications : ', notifications);
      return notifications;
    } catch (error) {
      console.log('getAllNotifications error : ', error);
      throw new InternalServerErrorException(
        'Error while fetching notifications',
      );
    }
  }

  async sendNotifications(
    usersId: string[],
    message: string,
    html: string,
    auctionId: number,
  ) {
    try {
      console.log('sendNotifications : ', usersId, message);
      const batchSize = 100;
      const userBatches = this.chunkArray(usersId, batchSize);
      // Send real-time notifications to online users
      usersId.forEach((userId) => {
        const notification = { message, html, auctionId };
        // this.emitNotification(userId, notification);
        this.sendNotificationsToAll(userId, notification);
      });
      const workers = [];

      for (const batch of userBatches) {
        const worker = new Worker(
          path.resolve(__dirname, 'notifications.worker.js'),
          {
            workerData: { usersId: batch, message, html, auctionId },
          },
        );

        worker.on('message', (result) => {
          console.log('worker message : ', result);
          if (result.success) {
            console.log(`Batch sent successfully`);
          } else {
            console.error(`Batch failed:`, result.error);
          }
        });

        worker.on('error', (error) => {
          console.error('Worker error:', error);
        });

        workers.push(worker);
      }

      await Promise.all(
        workers.map(
          (worker) => new Promise((resolve) => worker.on('exit', resolve)),
        ),
      );
    } catch (error) {
      console.log('sendNotifications error : ', error);
    }
  }

  private chunkArray(array: string[], size: number): string[][] {
    const result: string[][] = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  }

  async getAllRegisteredUsers(currentUserId: number, batchSize = 1000) {
    const usersId = [];
    let skip = 0;
    let batch: any;

    try {
      do {
        // Fetch a batch of users
        batch = await this.prismaService.user.findMany({
          skip: skip,
          take: batchSize,
          where: {
            id: {
              not: currentUserId,
            },
          },
          select: {
            id: true,
          },
        });

        // Add fetched emails to the list
        usersId.push(...batch.map((user: any) => user.id.toString()));

        // Increment the skip counter for the next batch
        skip += batchSize;
      } while (batch.length > 0); // Continue fetching until no more users are returned
      console.log('usersId : ', usersId);
      return usersId;
    } catch (error) {
      console.log(
        'Error while fetching user email address for bulk email:',
        error,
      );
    }
  }
}
