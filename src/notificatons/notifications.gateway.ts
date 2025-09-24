import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true })
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;
  handleConnection(client: Socket) {
    if (!client.handshake.headers['authorization']) client.disconnect(true);
    const userId = client.handshake.query.userId;
    client.join(`user:${userId}`);
    console.log(`Client connected: ${client.id} with userId: ${userId}`);
  }
  handleDisconnect(client: Socket) {
    // console.log(`Client disconnected: ${client.id}`);
  }

  sendNotificationToAll(notification: any) {
    if (notification.status === 'ON_SELLING') {
      this.server.emit('notification', notification);
    } else if (
      notification.status === 'ON_BIDDING' &&
      notification.userType === 'OTHER_BIDDERS'
    ) {
      for (const userID of notification.usersId) {
        this.server
          .to(`user:${userID ?? null}`)
          .emit('notification', notification);
      }
    } else {
      this.server
        .to(`user:${notification.usersId ?? null}`)
        .emit('notification', notification);
    }
  }
  sendNotificationToSpecificUser(notification: any) {
    if (notification.status === 'ON_SELLING') {
      this.server.emit('notification', notification);
    } else if (
      notification.status === 'ON_BIDDING' &&
      notification.userType === 'OTHER_BIDDERS'
    ) {
      console.log('111');
      for (const userID of notification.usersId) {
        this.server
          .to(`user:${userID ?? null}`)
          .emit('notification', notification);
      }
    } else {
      this.server
        .to(`user:${notification.usersId ?? null}`)
        .emit('notification', notification);
    }
  }
}
