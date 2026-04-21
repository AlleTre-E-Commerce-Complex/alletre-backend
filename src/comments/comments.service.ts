import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notificatons/notifications.service';
import { Role } from '../auth/enums/role.enum';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getCommentsByProduct(productId: number, userId?: number) {
    const comments = await (this.prisma as any).comment.findMany({
      where: { productId, parentId: null }, // Only top-level comments
      include: {
        user: {
          select: {
            id: true,
            userName: true,
            imageLink: true,
          },
        },
        _count: {
          select: { likes: true },
        },
        likes: userId ? {
          where: { userId: Number(userId) },
          select: { id: true },
        } : undefined,
        replies: {
          include: {
            user: {
              select: {
                id: true,
                userName: true,
                imageLink: true,
              },
            },
            _count: {
              select: { likes: true },
            },
            likes: userId ? {
              where: { userId: Number(userId) },
              select: { id: true },
            } : undefined,
          },
          orderBy: { createdAt: 'asc' }, // Replies in chronological order
        },
      },
      orderBy: { createdAt: 'desc' }, // Main comments newest first
    });

    return comments.map(comment => ({
      ...comment,
      likesCount: comment._count.likes,
      isLiked: !!(comment as any).likes?.length,
      likes: undefined,
      _count: undefined,
      replies: comment.replies.map(reply => ({
        ...reply,
        likesCount: reply._count.likes,
        isLiked: !!(reply as any).likes?.length,
        likes: undefined,
        _count: undefined,
      })),
    }));
  }

  async addComment(userId: number, productId: number, content: string, roles: string[] = [], parentId?: number) {
    // Verify product exists first
    const productData = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { title: true, images: { take: 1 } },
    });

    if (!productData) {
      throw new NotFoundException('Product not found');
    }

    if (parentId) {
      const parentComment = await (this.prisma as any).comment.findUnique({
        where: { id: parentId },
      });
      if (!parentComment) {
        throw new NotFoundException('Parent comment not found');
      }
    }

    const newComment = await (this.prisma as any).comment.create({
      data: {
        userId: Number(userId),
        productId: Number(productId),
        content,
        parentId: parentId ? Number(parentId) : null,
      },
      include: {
        user: {
          select: {
            id: true,
            userName: true,
            imageLink: true,
          },
        },
      },
    });

    // Send notification if it's a reply
    if (parentId) {
      this.handleReplyNotification(newComment, parentId, roles, productData);
    }

    return newComment;
  }

  private async handleReplyNotification(newComment: any, parentId: number, roles: string[], productData: any) {
    try {
      const parentComment = await (this.prisma as any).comment.findUnique({
        where: { id: parentId },
        select: { userId: true },
      });

      // Don't notify if the user is replying to their own comment
      if (parentComment && parentComment.userId !== newComment.userId) {
        const isAdmin = roles.includes(Role.Admin);
        const replierName = newComment.user.userName || 'Someone';
        const messageEn = isAdmin 
          ? `Admin replied to your comment: "${newComment.content.substring(0, 50)}${newComment.content.length > 50 ? '...' : ''}"`
          : `${replierName} replied to your comment: "${newComment.content.substring(0, 50)}${newComment.content.length > 50 ? '...' : ''}"`;

        await this.notificationsService.sendNotifications(
          [parentComment.userId.toString()],
          messageEn,
          productData.images[0]?.imageLink || '',
          productData.title || '',
          undefined,
          false,
          newComment.productId,
        );
      }
    } catch (error) {
      console.error('[CommentsService] Error sending reply notification:', error);
    }
  }

  async updateComment(userId: number, commentId: number, content: string) {
    const comment = await (this.prisma as any).comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new UnauthorizedException('You can only edit your own comments');
    }

    return (this.prisma as any).comment.update({
      where: { id: commentId },
      data: { content },
      include: {
        user: {
          select: {
            id: true,
            userName: true,
            imageLink: true,
          },
        },
      },
    });
  }

  async deleteComment(userId: number, commentId: number) {
    const comment = await (this.prisma as any).comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new UnauthorizedException('You can only delete your own comments');
    }

    return this.prisma.$transaction(async (tx: any) => {
      // 1. Get all reply IDs
      const replies = await tx.comment.findMany({
        where: { parentId: commentId },
        select: { id: true },
      });
      const replyIds = replies.map((r) => r.id);

      // 2. Delete likes for replies
      if (replyIds.length > 0) {
        await tx.commentLike.deleteMany({
          where: { commentId: { in: replyIds } },
        });
      }

      // 3. Delete likes for the parent comment
      await tx.commentLike.deleteMany({
        where: { commentId },
      });

      // 4. Delete replies
      if (replyIds.length > 0) {
        await tx.comment.deleteMany({
          where: { id: { in: replyIds } },
        });
      }

      // 5. Delete the parent comment
      return tx.comment.delete({
        where: { id: commentId },
      });
    });
  }

  async toggleLike(userId: number, commentId: number) {
    const existingLike = await (this.prisma as any).commentLike.findUnique({
      where: {
        commentId_userId: {
          commentId,
          userId,
        },
      },
    });

    if (existingLike) {
      await (this.prisma as any).commentLike.delete({
        where: { id: existingLike.id },
      });
      return { liked: false };
    } else {
      await (this.prisma as any).commentLike.create({
        data: {
          commentId,
          userId,
        },
      });
      return { liked: true };
    }
  }

  // Admin methods
  async adminDeleteComment(commentId: number) {
    return (this.prisma as any).comment.delete({
      where: { id: commentId },
    });
  }
}
