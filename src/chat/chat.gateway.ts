import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers: Set<string> = new Set();

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    const userId = client.handshake.query.userId;
    if (userId) {
      const userIdStr = String(userId);
      client.join(`user:${userIdStr}`);
      this.connectedUsers.add(userIdStr);
      
      console.log(`User connected to chat: ${userIdStr}`);
      
      // Notify others and send current online list to the user
      this.server.emit('user_status', { userId: userIdStr, status: 'online' });
      
      // Sending current online users to the new client
      client.emit('online_users', Array.from(this.connectedUsers));
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.handshake.query.userId;
    if (userId) {
      const userIdStr = String(userId);
      this.connectedUsers.delete(userIdStr);
      console.log(`User disconnected from chat: ${userIdStr}`);
      this.server.emit('user_status', { userId: userIdStr, status: 'offline' });
    }
  }

  @SubscribeMessage('join_conversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: number,
  ) {
    const convIdStr = String(conversationId);
    client.join(`conversation:${convIdStr}`);
    return { event: 'joined', data: conversationId };
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: number,
  ) {
    const convIdStr = String(conversationId);
    client.leave(`conversation:${convIdStr}`);
    return { event: 'left', data: conversationId };
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: number; userId: number; isTyping: boolean },
  ) {
    const conversationIdNum = Number(data.conversationId);
    client.to(`conversation:${conversationIdNum}`).emit('typing', data);
  }

  @SubscribeMessage('mark_as_read')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number; userId: number },
  ) {
    const conversationIdNum = Number(data.conversationId);
    const userIdNum = Number(data.userId);

    const updated = await this.prisma.chatMessage.updateMany({
      where: {
        conversationId: conversationIdNum,
        senderId: { not: userIdNum },
        isRead: false,
      },
      data: { isRead: true },
    });

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationIdNum },
    });

    if (conversation) {
      const recipientId =
        conversation.buyerId === userIdNum
          ? conversation.sellerId
          : conversation.buyerId;

      const recipientIdStr = String(recipientId);
      const userIdStr = String(userIdNum);

      this.server.to(`user:${recipientIdStr}`).emit('messages_read', {
        conversationId: conversationIdNum,
        readerId: userIdNum,
      });

      this.server
        .to(`conversation:${conversationIdNum}`)
        .emit('messages_read', {
          conversationId: conversationIdNum,
          readerId: userIdNum,
        });
    }

    return { event: 'marked_read', data: conversationIdNum };
  }
}
