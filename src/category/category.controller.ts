import {
  Controller,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { AuthOrGuestGuard } from 'src/auth/guards/authOrGuest.guard';

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
}
