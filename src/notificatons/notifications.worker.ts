import { parentPort, workerData } from 'worker_threads';
import { PrismaService } from 'src/prisma/prisma.service';

async function sendNotifications(
  users: string[],
  message: string,
  html: string,
  auctionId: number,
) {
  try {
    console.log('sendNotifications worker : ', users, message);
    const prismaService = new PrismaService();
    const notifications = await prismaService.notification.createMany({
      data: users.map((usersId) => ({
        userId: Number(usersId),
        message,
        html,
        auctionId,
      })),
    });
    parentPort?.postMessage({ success: true, notifications });
  } catch (error) {
    console.log('sendNotifications error : ', error);
    parentPort?.postMessage({ success: false, error });
  }
}

sendNotifications(
  workerData.usersId,
  workerData.message,
  workerData.html,
  workerData.auctionId,
);
