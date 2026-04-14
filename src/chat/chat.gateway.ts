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

  constructor(private readonly prisma: PrismaService) {}

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId;
    if (userId) {
      client.join(`user:${userId}`);
      console.log(`User connected to chat: ${userId}`);
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`User disconnected from chat: ${client.id}`);
  }

  @SubscribeMessage('join_conversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: number,
  ) {
    client.join(`conversation:${conversationId}`);
    return { event: 'joined', data: conversationId };
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: number,
  ) {
    client.leave(`conversation:${conversationId}`);
    return { event: 'left', data: conversationId };
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: number; userId: number; isTyping: boolean },
  ) {
    client.to(`conversation:${data.conversationId}`).emit('typing', data);
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

      this.server.to(`user:${recipientId}`).emit('messages_read', {
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
