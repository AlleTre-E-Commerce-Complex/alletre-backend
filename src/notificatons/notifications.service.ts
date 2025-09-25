import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import * as qs from 'qs';
import { PrismaService } from 'src/prisma/prisma.service';
import * as path from 'path';
import * as admin from 'firebase-admin';
import { NotificationGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    private prismaService: PrismaService,
    private notificationGateway: NotificationGateway,
    private readonly httpService: HttpService,
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

  async sendPushNotificationToApplixUser(notificationData: {
    notification_title: string;
    notification_body: string;
    open_link_url?: string;
    notification_image?: string;
  }) {
    try {
      const formData = {
        app_key: process.env.APPLIX_APP_KEY,
        api_key: process.env.APPLIX_API_KEY,
        notification_title: notificationData.notification_title,
        notification_body: notificationData.notification_body,
      };

      if (notificationData.open_link_url) {
        formData['open_link_url'] = notificationData.open_link_url;
      }

      if (notificationData.notification_image) {
        formData['notification_image'] = notificationData.notification_image;
      }

      console.log('applix form data : ', formData);
      const response = await lastValueFrom(
        this.httpService.post(
          'https://appilix.com/api/push-notification',
          qs.stringify(formData),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      console.log('Push notification response:', response.data);
      return response.data;
    } catch (error) {
      console.error(
        'Error sending push notification:',
        error?.response?.data || error.message,
      );
      throw error;
    }
  }

  async getAllNotifications(userId: number) {
    try {
      const notifications = await this.prismaService.notification.findMany({
        where: {
          userId,
        },
        include: {
          auction: {
            select: {
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
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

  async sendNotificationToSpecificUsers(notification: any) {
    try {
      console.log('112233 :', notification);
      this.notificationGateway.sendNotificationToSpecificUser(notification);
      // let totalNotificationsSent = 0;
      const results = [];
      try {
        // 2. Get FCM tokens for these users
        const userTokens = await this.prismaService.pushSubscription.findMany({
          where: { userId: notification.usersId, fcmToken: { not: null } },
          select: { id: true, fcmToken: true },
        });

        // 3. Send Firebase push notifications in batches
        const fcmResults = [];
        console.log('users tokens :', userTokens);
        if (userTokens.length > 0) {
          const fcmMessages = userTokens.map((userToken) => ({
            token: userToken.fcmToken,
            notification: {
              title: 'New Notification',
              body: notification.message,
            },
            data: {
              auctionId: notification.auctionId.toString(),
              url: `/alletre/home/${notification.auctionId}/details`,
              imageLink: notification.imageLink,
              productTitle: notification.productTitle,
            },
            android: {
              priority: 'high',
            },
            apns: {
              payload: {
                aps: {
                  contentAvailable: true,
                },
              },
            },
          }));
          console.log('fcmResult:', fcmResults);
          const fcmBatchSize = 500;
          for (let i = 0; i < fcmMessages.length; i += fcmBatchSize) {
            const fcmBatch: any = fcmMessages.slice(i, i + fcmBatchSize);
            try {
              console.log('fcmBacth:', fcmBatch);
              const result = await admin.messaging().sendEach(fcmBatch);
              console.log('result :', result);
              fcmResults.push(result);
            } catch (error) {
              console.error('FCM batch send error:', error);
              // Continue with other batches even if one fails
            }
          }
        }

        // totalNotificationsSent += notification.count;
        // results.push({
        //   success: true,
        //   notifications: {
        //     count: notification.count,
        //     // fcmSent: userTokens.length,
        //     fcmSent: 0,
        //     fcmResults: [],
        //   },
        // });

        console.log(
          `Batch sent successfully: ${notification.count} notifications`,
        );
      } catch (error) {
        console.error('Batch failed:', error);
        results.push({ success: false, error: error.message });
      }

      // console.log(`Total notifications sent: ${totalNotificationsSent}`);
      return results;
    } catch (error) {
      console.error('sendNotifications error:', error);
      throw new InternalServerErrorException('Failed to send notifications');
    }
  }

  async sendNotifications(
    usersId: string[],
    message: string,
    imageLink: string,
    productTitle: string,
    auctionId: number,
    isBidders?: boolean,
  ) {
    try {
      const batchSize = 100;
      const userBatches = this.chunkArray(usersId, batchSize);

      // Send real-time notifications to online users
      if (isBidders) {
        const notification = {
          status: 'ON_BIDDING',
          userType: 'OTHER_BIDDERS',
          usersId: usersId,
          message: message,
          imageLink,
          productTitle,
          auctionId,
        };
        this.notificationGateway.sendNotificationToAll(notification);
      } else {
        const notification = {
          status: 'ON_SELLING',
          userType: 'ALL_USERS',
          usersId: usersId,
          message: message,
          imageLink,
          productTitle,
          auctionId,
        };
        this.notificationGateway.sendNotificationToAll(notification);
      }

      let totalNotificationsSent = 0;
      const results = [];

      for (const batch of userBatches) {
        try {
          // 1. Save notifications to database in bulk
          const notifications =
            await this.prismaService.notification.createMany({
              data: batch.map((userId) => ({
                userId: Number(userId),
                message,
                imageLink,
                productTitle,
                auctionId,
              })),
            });

          // 2. Get FCM tokens for these users
          const userTokens = await this.prismaService.pushSubscription.findMany(
            {
              where: {
                userId: {
                  in: batch.map(Number),
                },
                fcmToken: {
                  not: null,
                },
              },
              select: {
                userId: true,
                fcmToken: true,
              },
            },
          );

          // 3. Send Firebase push notifications in batches
          const fcmResults = [];
          console.log('users tokens :', userTokens);
          if (userTokens.length > 0) {
            const fcmMessages = userTokens.map((userToken) => ({
              token: userToken.fcmToken,
              notification: {
                title: 'New Notification',
                body: message,
              },
              data: {
                auctionId: auctionId.toString(),
                url: `/alletre/home/${auctionId}/details`,
                imageLink,
                productTitle,
              },
              android: {
                priority: 'high',
              },
              apns: {
                payload: {
                  aps: {
                    contentAvailable: true,
                  },
                },
              },
            }));
            console.log('fcmResult:', fcmResults);
            // Send in batches of 500 (Firebase limit)
            const fcmBatchSize = 500;
            for (let i = 0; i < fcmMessages.length; i += fcmBatchSize) {
              const fcmBatch: any = fcmMessages.slice(i, i + fcmBatchSize);
              try {
                console.log('fcmBacth:', fcmBatch);
                const result = await admin.messaging().sendEach(fcmBatch);
                console.log('result :', result);
                fcmResults.push(result);
              } catch (error) {
                console.error('FCM batch send error:', error);
                // Continue with other batches even if one fails
              }
            }
          }

          totalNotificationsSent += notifications.count;
          results.push({
            success: true,
            notifications: {
              count: notifications.count,
              // fcmSent: userTokens.length,
              fcmSent: 0,
              fcmResults: [],
            },
          });

          console.log(
            `Batch sent successfully: ${notifications.count} notifications`,
          );
        } catch (error) {
          console.error('Batch failed:', error);
          results.push({ success: false, error: error.message });
        }
      }

      console.log(`Total notifications sent: ${totalNotificationsSent}`);
      return results;
    } catch (error) {
      console.error('sendNotifications error:', error);
      throw new InternalServerErrorException('Failed to send notifications');
    }
  }

  async markNotificationsAsRead(userId: number, notificationIds: number[]) {
    // console.log('notificationIds : ', notificationIds);
    return await this.prismaService.notification.updateMany({
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
    return await this.prismaService.notification.count({
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

  async getAllJoinedAuctionUsers(auctionId: number, currentUserId: number) {
    try {
      const allJoinedUserIds = await this.prismaService.joinedAuction.findMany({
        where: {
          auctionId: auctionId,
          userId: {
            not: currentUserId, // Exclude the current user ID
          },
        },
        select: {
          userId: true, // Only select userId
        },
      });
      return allJoinedUserIds.map((user) => user.userId.toString());
    } catch (error) {
      console.error('getAllJoinedAuctionUsers error:', error);
      throw error; // Optionally rethrow the error
    }
  }

  async sendPushNotification(
    userId: number | string,
    payload: {
      title: string;
      body: string;
      url?: string;
      image?: string;
      data?: Record<string, string | number | boolean>;
    },
  ): Promise<{
    success: boolean;
    message?: string;
    messageId?: string;
    error?: any;
  }> {
    try {
      const uid = Number(userId);
      if (!uid) return { success: false, message: 'Invalid userId' };

      // 1) Find stored FCM token for the user
      const pushSub = await this.prismaService.pushSubscription.findFirst({
        where: { userId: uid },
        select: { fcmToken: true },
      });

      if (!pushSub || !pushSub.fcmToken) {
        return { success: false, message: 'No FCM token for user' };
      }

      const token = pushSub.fcmToken;

      // 2) Normalize data values to strings (FCM requires strings in `data`)
      const normalizedData: Record<string, string> = {};
      if (payload.data) {
        for (const [k, v] of Object.entries(payload.data)) {
          normalizedData[k] = v === undefined || v === null ? '' : String(v);
        }
      }

      // attach url/image into data so client can handle clicks
      if (payload.url) normalizedData.url = payload.url;
      if (payload.image) normalizedData.image = payload.image;

      // 3) Build message
      const message: admin.messaging.Message = {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: normalizedData,
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
              alert: {
                title: payload.title,
                body: payload.body,
              },
            },
          },
        },
        webpush: {
          headers: {
            Urgency: 'high',
          },
        },
      };

      // 4) Send
      const messageId = await admin.messaging().send(message);

      return { success: true, message: 'Sent', messageId };
    } catch (err) {
      console.error('sendPushNotification error:', err);

      // detect common "invalid token" errors and prune the token
      const errCode = err?.code || err?.errorInfo?.code || err?.message;
      if (
        errCode === 'messaging/registration-token-not-registered' ||
        errCode === 'messaging/invalid-registration-token' ||
        (typeof errCode === 'string' && errCode.includes('not registered'))
      ) {
        try {
          // best-effort prune this token from DB
          await this.prismaService.pushSubscription.deleteMany({
            where: {
              fcmToken: String(err?.token || err?.fcmToken) || undefined,
            },
          });
        } catch (pruneErr) {
          console.warn('Failed to prune invalid token:', pruneErr);
        }
        return {
          success: false,
          message: 'Invalid or unregistered FCM token - pruned',
          error: errCode,
        };
      }

      return { success: false, message: 'Failed to send push', error: err };
    }
  }
}
