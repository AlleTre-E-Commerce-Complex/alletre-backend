// src/notifications.child.ts
import { PrismaService } from 'src/prisma/prisma.service';
import * as admin from 'firebase-admin';
import { Message } from 'firebase-admin/messaging';

let prismaService: PrismaService;

interface NotificationMessage {
  usersId: string[];
  message: string;
  imageLink: string;
  productTitle: string;
  auctionId: number;
  firebaseConfig: admin.ServiceAccount;
}

async function cleanup() {
  try {
    if (prismaService) {
      await prismaService.$disconnect();
    }
    // Cleanup Firebase Admin resources
    if (admin.apps.length) {
      await Promise.all(admin.apps.map(app => app?.delete()));
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

async function sendNotifications(
  users: string[],
  message: string,
  imageLink: string,
  productTitle: string,
  auctionId: number,
  firebaseConfig: admin.ServiceAccount,
) {
  prismaService = new PrismaService();

  try {
    // Initialize Firebase Admin with config from parent
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig),
      });
    }

    // 1. Save notifications to database in bulk
    const notifications = await prismaService.notification.createMany({
      data: users.map((usersId) => ({
        userId: Number(usersId),
        message,
        imageLink,
        productTitle,
        auctionId,
      })),
    });

    // 2. Get FCM tokens for these users
    const userTokens = await prismaService.pushSubscription.findMany({
      where: {
        userId: {
          in: users.map(Number),
        },
        fcmToken: {
          not: null,
        },
      },
      select: {
        userId: true,
        fcmToken: true,
      },
    });

    // 3. Send Firebase push notifications in batches
    const fcmResults = [];
    if (userTokens.length > 0) {
      const fcmMessages: admin.messaging.Message[] = userTokens.map((userToken) => ({
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
          priority: 'high' as const,
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
            },
          },
        },
      }));

      // Send in batches of 500 (Firebase limit)
      const batchSize = 500;
      for (let i = 0; i < fcmMessages.length; i += batchSize) {
        const batch = fcmMessages.slice(i, i + batchSize);
        try {
          const result = await admin.messaging().sendEach(batch);
          fcmResults.push(result);
        } catch (error) {
          console.error('FCM batch send error:', error);
          // Continue with other batches even if one fails
        }
      }
    }

    process.send?.({
      success: true,
      notifications: {
        count: notifications.count,
        fcmSent: userTokens.length,
        fcmResults,
      },
    });
  } catch (error) {
    console.error('Worker error:', error);
    process.send?.({
      success: false,
      error: error.message,
    });
  } finally {
    await cleanup();
    // Allow time for cleanup and message sending before exit
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
}

// Listen for messages from the parent process
process.on('message', (message: NotificationMessage) => {
  sendNotifications(
    message.usersId,
    message.message,
    message.imageLink,
    message.productTitle,
    message.auctionId,
    message.firebaseConfig,
  );
});