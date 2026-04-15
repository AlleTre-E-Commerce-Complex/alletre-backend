import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { Account } from '../auth/decorators/account.decorator';
import { ChatService } from './chat.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FirebaseService } from '../firebase/firebase.service';
import { ChatMessageType } from '@prisma/client';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly firebaseService: FirebaseService,
  ) {}

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
    @Body()
    body: {
      content: string;
      type?: ChatMessageType;
      attachmentUrl?: string;
      attachmentPath?: string;
      lat?: number;
      lng?: number;
    },
  ) {
    return {
      success: true,
      data: await this.chatService.sendMessage(
        account.id,
        +id,
        body.content,
        body.type,
        body.attachmentUrl,
        body.attachmentPath,
        body.lat,
        body.lng,
      ),
    };
  }

  @Post('conversations/upload')
  @UseInterceptors(FilesInterceptor('files', 10, { dest: 'uploads/' }))
  async uploadAttachment(@UploadedFiles() files: Array<Express.Multer.File>) {
    const results = [];
    for (const file of files) {
      let result;
      if (file.mimetype === 'application/pdf') {
        result = await this.firebaseService.uploadPdf(file, 'chat-doc');
      } else {
        result = await this.firebaseService.uploadImage(file, 'chat-media');
      }
      results.push(result);
    }
    return {
      success: true,
      data: results,
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
