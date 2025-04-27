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

  private clients = new Map(); // Track clients by userId
  private auctionRooms = new Map(); // Track which users are listening to each auction
  private registeredUsers = new Set(); // Set of all registered userIds

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId;
    console.log(`Client connected: ${client.id} with userId: ${userId}`);
  }

  handleDisconnect(client: any) {
    // console.log(`Client disconnected: ${client.id}`);
  }

  sendNotificationToAll(notification: any) {
    this.server.emit('notification', notification); // This sends to all connected clients
  }
}
