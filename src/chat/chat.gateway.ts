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

  // Track session counts per user: Map<userId, count>
  private connectedUsers: Map<string, number> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    const userId = client.handshake.query.userId;
    if (userId) {
      const userIdStr = String(userId);
      client.join(`user:${userIdStr}`);
      
      const currentCount = this.connectedUsers.get(userIdStr) || 0;
      this.connectedUsers.set(userIdStr, currentCount + 1);
      
      console.log(`[ChatSocket] User connected: ${userIdStr} (Total sessions: ${currentCount + 1})`);
      
      // Notify everyone about online status if this is the first session
      if (currentCount === 0) {
        this.server.emit('user_status', { userId: userIdStr, status: 'online' });
      }
      
      // Send the current list of online users solely to the connecting client
      const onlineUserIds = Array.from(this.connectedUsers.keys());
      client.emit('online_users', onlineUserIds);
    } else {
      console.log(`[ChatSocket] Anonymous connection: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.handshake.query.userId;
    if (userId) {
      const userIdStr = String(userId);
      const currentCount = this.connectedUsers.get(userIdStr) || 1;
      
      if (currentCount <= 1) {
        this.connectedUsers.delete(userIdStr);
        console.log(`[ChatSocket] User disconnected: ${userIdStr} (Now Offline)`);
        // Only notify offline if all sessions are gone
        this.server.emit('user_status', { userId: userIdStr, status: 'offline' });
      } else {
        this.connectedUsers.set(userIdStr, currentCount - 1);
        console.log(`[ChatSocket] Session closed for user: ${userIdStr} (Remaining: ${currentCount - 1})`);
      }
    }
  }

  @SubscribeMessage('join_conversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: number,
  ) {
    const convIdStr = String(conversationId);
    client.join(`conversation:${convIdStr}`);
    console.log(`[ChatSocket] Client ${client.id} joined conversation: ${convIdStr}`);
    return { event: 'joined', data: conversationId };
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: number,
  ) {
    const convIdStr = String(conversationId);
    client.leave(`conversation:${convIdStr}`);
    console.log(`[ChatSocket] Client ${client.id} left conversation: ${convIdStr}`);
    return { event: 'left', data: conversationId };
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: number; userId: number; isTyping: boolean },
  ) {
    const conversationIdStr = String(data.conversationId);
    client.to(`conversation:${conversationIdStr}`).emit('typing', data);
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
      const conversationIdStr = String(conversationIdNum);

      this.server.to(`user:${recipientIdStr}`).emit('messages_read', {
        conversationId: conversationIdNum,
        readerId: userIdNum,
      });

      this.server
        .to(`conversation:${conversationIdStr}`)
        .emit('messages_read', {
          conversationId: conversationIdNum,
          readerId: userIdNum,
        });
    }

    return { event: 'marked_read', data: conversationIdNum };
  }
}
