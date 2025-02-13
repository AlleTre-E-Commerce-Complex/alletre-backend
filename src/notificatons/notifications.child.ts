// src/notifications.child.ts
import { PrismaService } from 'src/prisma/prisma.service';
import * as admin from 'firebase-admin';

async function sendNotifications(
  users: string[],
  message: string,
  imageLink: string,
  productTitle: string,
  auctionId: number,
  firebaseConfig: any,
) {
  const prismaService = new PrismaService();

  try {
    console.log('notification child test1')
    // Initialize Firebase Admin with config from parent
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig),
      });
    }
    console.log('notification child test2')

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
    console.log('notification child test3')

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
    console.log('notification child test4')

    // 3. Send Firebase push notifications in batches
    if (userTokens.length > 0) {
      const fcmMessages = userTokens.map((userToken) => ({
        token: userToken.fcmToken,
        notification: {
          title: 'New Notification---**---',
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

      // Send in batches of 500 (Firebase limit)
      const batchSize = 500;
      const fcmResults = [];

      for (let i = 0; i < fcmMessages.length; i += batchSize) {
        const batch = fcmMessages.slice(i, i + batchSize);
        try {
          const result = await admin.messaging().sendEach(
            batch.map((msg) => ({
              ...msg,
              android: {
                priority: 'high',
              },
            })),
          );
          fcmResults.push(result);
        } catch (error) {
          console.error('FCM batch send error:', error);
          // Continue with other batches even if one fails
        }
      }
    }

    await prismaService.$disconnect();
    process.send({
      success: true,
      notifications: {
        count: notifications.count,
        fcmSent: userTokens.length,
      },
    });
    console.log('notification send bulk ended')
    process.exit(0); 
  } catch (error) {
    console.error('Worker error:', error);
    await prismaService.$disconnect();
    process.send({
      success: false,
      error: error.message,
    });
  }finally{
    process.exit(0)
  }
}

// Listen for messages from the parent process
process.on('message', (message:any) => {
  sendNotifications(
    message.usersId,
    message.message,
    message.imageLink,
    message.productTitle,
    message.auctionId,
    message.firebaseConfig,
  );
});