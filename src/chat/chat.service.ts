import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from './chat.gateway';
import { ChatMessageType } from '@prisma/client';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatGateway: ChatGateway,
  ) {}

  // ... (getConversations and getMessages remain same structure but will benefit from schema change)

  async getConversations(userId: number) {
    return this.prisma.conversation.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      include: {
        buyer: { select: { id: true, userName: true, imageLink: true } },
        seller: { select: { id: true, userName: true, imageLink: true } },
        product: {
          select: {
            id: true,
            title: true,
            ProductListingPrice: true,
            images: { take: 1 },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getMessages(conversationId: number, userId: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (
      !conversation ||
      (conversation.buyerId !== userId && conversation.sellerId !== userId)
    ) {
      throw new NotFoundException('Conversation not found');
    }

    // Mark messages as read
    await this.prisma.chatMessage.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true },
    });

    return this.prisma.chatMessage.findMany({
      where: { conversationId },
      include: {
        sender: { select: { id: true, userName: true, imageLink: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendMessage(
    userId: number,
    conversationId: number,
    content: string,
    type: ChatMessageType = ChatMessageType.TEXT,
    attachmentUrl?: string,
    attachmentPath?: string,
    lat?: number,
    lng?: number,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (
      !conversation ||
      (conversation.buyerId !== userId && conversation.sellerId !== userId)
    ) {
      throw new NotFoundException('Conversation not found');
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        conversationId,
        senderId: userId,
        content,
        type,
        attachmentUrl,
        attachmentPath,
        lat,
        lng,
      },
      include: {
        sender: { select: { id: true, userName: true, imageLink: true } },
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Notify the other user
    const recipientId =
      conversation.buyerId === userId
        ? conversation.sellerId
        : conversation.buyerId;
    
    const recipientIdStr = String(recipientId);
    const conversationIdStr = String(conversationId);

    this.chatGateway.server
      .to(`user:${recipientIdStr}`)
      .emit('new_message', message);
    this.chatGateway.server
      .to(`conversation:${conversationIdStr}`)
      .emit('new_message', message);

    return message;
  }

  async getOrCreateConversation(
    buyerId: number,
    sellerId: number,
    productId?: number,
  ) {
    if (Number(buyerId) === Number(sellerId)) {
      throw new BadRequestException(
        'You cannot start a conversation with yourself',
      );
    }

    const include = {
      buyer: { select: { id: true, userName: true, imageLink: true } },
      seller: { select: { id: true, userName: true, imageLink: true } },
      product: {
        select: {
          id: true,
          title: true,
          ProductListingPrice: true,
          images: { take: 1 },
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      },
    };

    // Ensure productId is a valid number if provided
    try {
      const validProductId =
        productId && !isNaN(Number(productId)) ? Number(productId) : undefined;

      let conversation = await this.prisma.conversation.findFirst({
        where: {
          buyerId,
          sellerId,
          productId: validProductId,
        },
        include,
      });

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            buyerId,
            sellerId,
            productId: validProductId,
          },
          include,
        });
      }

      return conversation;
    } catch (error) {
      console.error('ChatService getOrCreateConversation error:', error);
      if (error.code === 'P2002') {
        throw new BadRequestException(
          'A conversation for this product already exists.',
        );
      }
      if (error.code === 'P2003') {
        throw new BadRequestException('Target product or user does not exist.');
      }
      throw error;
    }
  }

  async markAsRead(conversationId: number, userId: number) {
    // Mark all messages from the other user as read
    const updated = await this.prisma.chatMessage.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true },
    });

    if (updated.count > 0) {
      // Notify the other user (the sender) that their messages were read
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });

      if (conversation) {
        const recipientId =
          conversation.buyerId === userId
            ? conversation.sellerId
            : conversation.buyerId;

        const recipientIdStr = String(recipientId);
        const conversationIdStr = String(conversationId);

        this.chatGateway.server
          .to(`user:${recipientIdStr}`)
          .emit('messages_read', { conversationId, readerId: userId });
        
        // Also emit to the conversation room if needed
        this.chatGateway.server
          .to(`conversation:${conversationIdStr}`)
          .emit('messages_read', { conversationId, readerId: userId });
      }
    }

    return updated;
  }
}
