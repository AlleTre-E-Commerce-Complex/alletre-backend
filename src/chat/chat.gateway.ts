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
      const userIdStr = Array.isArray(userId) ? userId[0] : userId;
      if (!userIdStr) return;
      
      client.join(`user:${userIdStr}`);
      
      // Update Prisma with the latest socket ID for this user
      await this.prisma.user.update({
        where: { id: userIdStr },
        data: { socketId: client.id }
      }).catch(err => console.error(`[ChatSocket] DB Update Error: ${err.message}`));

      const currentCount = (this.connectedUsers.get(userIdStr) || 0) + 1;
      this.connectedUsers.set(userIdStr, currentCount);
      
      console.log(`[ChatSocket] User connected: ${userIdStr} (Session count on this instance: ${currentCount})`);
      
      // Notify everyone about online status
      this.server.emit('user_status', { userId: userIdStr, status: 'online' });
      
      // Send the current list of online users (from DB could be slow, using local Map for now for online_users list)
      const onlineUserIds = Array.from(this.connectedUsers.keys());
      client.emit('online_users', onlineUserIds);
    } else {
      console.log(`[ChatSocket] Anonymous connection: ${client.id}`);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.handshake.query.userId;
    if (userId) {
      const userIdStr = Array.isArray(userId) ? userId[0] : userId;
      if (!userIdStr) return;
      
      const currentCount = (this.connectedUsers.get(userIdStr) || 1) - 1;
      
      if (currentCount <= 0) {
        this.connectedUsers.delete(userIdStr);
        
        // Only clear the DB socketId if it matches THIS disconnecting client
        const user = await this.prisma.user.findUnique({ where: { id: userIdStr } });
        if (user && user.socketId === client.id) {
          await this.prisma.user.update({
            where: { id: userIdStr },
            data: { socketId: null }
          }).catch(() => {});
          console.log(`[ChatSocket] User disconnected: ${userIdStr} (Now Offline globally)`);
          this.server.emit('user_status', { userId: userIdStr, status: 'offline' });
        }
      } else {
        this.connectedUsers.set(userIdStr, currentCount);
        console.log(`[ChatSocket] Session closed for user: ${userIdStr} (Remaining sessions on this instance: ${currentCount})`);
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
    data: { conversationId: number; userId: string; isTyping: boolean },
  ) {
    const conversationIdStr = String(data.conversationId);
    client.to(`conversation:${conversationIdStr}`).emit('typing', data);
  }

  @SubscribeMessage('mark_as_read')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number; userId: string },
  ) {
    const conversationIdNum = Number(data.conversationId);
    const userIdStr = String(data.userId);

    const updated = await this.prisma.chatMessage.updateMany({
      where: {
        conversationId: conversationIdNum,
        senderId: { not: userIdStr },
        isRead: false,
      },
      data: { isRead: true },
    });

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationIdNum },
    });

    if (conversation) {
      const recipientId =
        conversation.buyerId === userIdStr
          ? conversation.sellerId
          : conversation.buyerId;

      const recipientIdStr = String(recipientId);
      const conversationIdStr = String(conversationIdNum);

      this.server.to(`user:${recipientIdStr}`).emit('messages_read', {
        conversationId: conversationIdNum,
        readerId: userIdStr,
      });

      this.server
        .to(`conversation:${conversationIdStr}`)
        .emit('messages_read', {
          conversationId: conversationIdNum,
          readerId: userIdStr,
        });
    }

    return { event: 'marked_read', data: conversationIdNum };
  }
}
