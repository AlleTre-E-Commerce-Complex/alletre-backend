import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Worker } from 'worker_threads';
import * as path from 'path';
import * as admin from 'firebase-admin';
import { NotificationGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    private prismaService: PrismaService,
    private notificationGateway: NotificationGateway,
  ) {
    // Initialize Firebase Admin
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
  }

  // Save FCM token
  async saveFCMToken(userId: string, fcmToken: string) {
    try {
      await this.prismaService.pushSubscription.upsert({
        where: { userId: Number(userId) },
        update: { fcmToken },
        create: {
          userId: Number(userId),
          fcmToken,
        },
      });
      console.log('Saved FCM token for user:', userId);
    } catch (error) {
      console.log('Error saving FCM token:', error);
      throw new InternalServerErrorException('Failed to save FCM token');
    }
  }

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
      const notifications = await this.prismaService.notification.findMany({
        where: {
          userId,
        },
      });
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
      const batchSize = 100;
      const userBatches = this.chunkArray(usersId, batchSize);

      // Send real-time notifications to online users
      usersId.forEach((userId) => {
        const notification = { message, html, auctionId };
        // Changed from sendNotificationsToAll to sendNotificationToUser
        this.notificationGateway.sendNotificationToAll(notification);
      });

      const workers = [];
      const results = [];

      for (const batch of userBatches) {
        const worker = new Worker(
          path.resolve(__dirname, 'notifications.worker.js'),
          {
            workerData: {
              usersId: batch,
              message,
              html,
              auctionId,
              // Add Firebase config to worker data
              firebaseConfig: {
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY,
              },
            },
          },
        );

        worker.on('message', (result) => {
          results.push(result);
          if (result.success) {
            console.log(
              `Batch sent successfully: ${result.notifications.count} notifications`,
            );
          } else {
            console.error(`Batch failed:`, result.error);
          }
        });

        worker.on('error', (error) => {
          console.error('Worker error:', error);
          results.push({ success: false, error });
        });

        workers.push(worker);
      }

      await Promise.all(
        workers.map(
          (worker) => new Promise((resolve) => worker.on('exit', resolve)),
        ),
      );

      return results;
    } catch (error) {
      console.error('sendNotifications error:', error);
      throw new InternalServerErrorException('Failed to send notifications');
    }
  }

  async markNotificationsAsRead(userId: number, notificationIds: number[]) {
    // console.log('notificationIds : ', notificationIds);
    return this.prismaService.notification.updateMany({
      where: {
        // id: { in: notificationIds },
        userId: userId,
      },
      data: {
        isRead: true,
      },
    });
  }

  async getUnreadNotificationCount(userId: number) {
    return this.prismaService.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
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
