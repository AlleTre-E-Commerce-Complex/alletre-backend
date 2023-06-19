import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { AuthOrGuestGuard } from 'src/auth/guards/authOrGuest.guard';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { MethodNotAllowedResponse } from 'src/common/errors';
import { AuthGuard } from 'src/auth/guards/auth.guard';

@Controller('categories')
export class CategoryController {
  constructor(private categoryService: CategoryService) {}

  @Get('all')
  @UseGuards(AuthOrGuestGuard)
  async findCategories() {
    return {
      success: true,
      data: await this.categoryService.getAllCategories(),
    };
  }
  @Get('/sub-categories')
  @UseGuards(AuthOrGuestGuard)
  async findSubCategories(
    @Query('categoryId', ParseIntPipe) categoryId: number,
  ) {
    return {
      success: true,
      data: await this.categoryService.getAllSubCategories(categoryId),
    };
  }
  @Get('custom-fields')
  @UseGuards(AuthOrGuestGuard)
  async getCustomFieldsController(
    @Query('categoryId') categoryId: number,
    @Query('subCategoryId') subCategoryId: number,
  ) {
    return {
      success: true,
      data: await this.categoryService.getCustomFields(
        categoryId,
        subCategoryId,
      ),
    };
  }

  @Get('system-fields')
  @UseGuards(AuthOrGuestGuard)
  async getSystemFieldsController() {
    return {
      success: true,
      data: await this.categoryService.getSystemCustomFields(),
    };
  }

  @Get('brands')
  @UseGuards(AuthOrGuestGuard)
  async getAllBrands(@Query('categoryId') categoryId: number) {
    return {
      success: true,
      data: await this.categoryService.getAllBrands(categoryId),
    };
  }

  @Put('/:categoryId/upload-images')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'banner', maxCount: 1 },
        { name: 'slider', maxCount: 1 },
      ],
      { dest: 'uploads/' },
    ),
  )
  async uploadImages(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @UploadedFiles()
    files: {
      banner?: Express.Multer.File;
      slider?: Express.Multer.File;
    },
  ) {
    if (!files)
      throw new MethodNotAllowedResponse({
        ar: 'قم برفع الصور',
        en: 'Upload Images',
      });

    return {
      success: true,
      data: await this.categoryService.uploadImagesForCategory(
        categoryId,
        files.banner[0],
        files.slider[0],
      ),
    };
  }
}
