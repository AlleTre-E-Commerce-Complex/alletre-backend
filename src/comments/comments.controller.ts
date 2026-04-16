import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  InternalServerErrorException,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Account } from '../auth/decorators/account.decorator';

@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get(':productId')
  async getComments(
    @Param('productId') productId: string,
    @Query('userId') userId?: string,
  ) {
    try {
      console.log('--- ADMIN REQUEST: Fetching comments for product:', productId);
      return {
        success: true,
        data: await this.commentsService.getCommentsByProduct(+productId, userId ? +userId : undefined),
      };
    } catch (error) {
      console.error('getComments error:', error);
      throw new InternalServerErrorException(error.message);
    }
  }

  @Post()
  @UseGuards(AuthGuard)
  async addComment(
    @Account() account: any,
    @Body() body: { productId: number; content: string; parentId?: number },
  ) {
    try {
      return {
        success: true,
        data: await this.commentsService.addComment(
          Number(account.id), 
          Number(body.productId), 
          body.content,
          body.parentId ? Number(body.parentId) : undefined
        ),
      };
    } catch (error) {
      console.error('addComment error:', error);
      throw new InternalServerErrorException(error.message);
    }
  }

  @Put(':id')
  @UseGuards(AuthGuard)
  async updateComment(
    @Account() account: any,
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    try {
      return {
        success: true,
        data: await this.commentsService.updateComment(Number(account.id), +id, body.content),
      };
    } catch (error) {
      console.error('updateComment error:', error);
      throw new InternalServerErrorException(error.message);
    }
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async deleteComment(@Account() account: any, @Param('id') id: string) {
    try {
      return {
        success: true,
        data: await this.commentsService.deleteComment(Number(account.id), +id),
      };
    } catch (error) {
      console.error('deleteComment error:', error);
      throw new InternalServerErrorException(error.message);
    }
  }

  @Post(':id/like')
  @UseGuards(AuthGuard)
  async toggleLike(@Account() account: any, @Param('id') id: string) {
    try {
      return {
        success: true,
        data: await this.commentsService.toggleLike(Number(account.id), +id),
      };
    } catch (error) {
      console.error('toggleLike error:', error);
      throw new InternalServerErrorException(error.message);
    }
  }
}
