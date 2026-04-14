import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Account } from '../auth/decorators/account.decorator';
import { ChatService } from './chat.service';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  async getConversations(@Account() account: any) {
    return {
      success: true,
      data: await this.chatService.getConversations(account.id),
    };
  }

  @Get('conversations/:id/messages')
  async getMessages(@Account() account: any, @Param('id') id: string) {
    return {
      success: true,
      data: await this.chatService.getMessages(+id, account.id),
    };
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @Account() account: any,
    @Param('id') id: string,
    @Body('content') content: string,
  ) {
    return {
      success: true,
      data: await this.chatService.sendMessage(account.id, +id, content),
    };
  }

  @Post('conversations/get-or-create')
  async getOrCreateConversation(
    @Account() account: any,
    @Body() body: { sellerId: any; productId?: any },
  ) {
    console.log('ChatController: getOrCreateConversation', {
      currentUserId: account.id,
      body,
    });

    try {
      const sellerId = Number(body.sellerId);
      const productId = body.productId ? Number(body.productId) : undefined;

      if (isNaN(sellerId)) {
        throw new Error(`Invalid sellerId: ${body.sellerId}`);
      }

      console.log(
        'ChatController calling ChatService.getOrCreateConversation with:',
        {
          buyerId: account.id,
          sellerId,
          productId,
        },
      );

      const conversation = await this.chatService.getOrCreateConversation(
        account.id,
        sellerId,
        productId,
      );

      return {
        success: true,
        data: conversation,
      };
    } catch (error) {
      console.error('ChatController Error DETAILS:', {
        message: error.message,
        stack: error.stack,
        code: error.code,
      });
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }
}
