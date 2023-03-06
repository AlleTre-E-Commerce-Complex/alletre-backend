import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { CategoryService } from './category.service';

@Controller('categories')
export class CategoryController {
  constructor(private categoryService: CategoryService) {}

  @Get('all')
  async findCategories() {
    return {
      success: true,
      data: await this.categoryService.getAllCategories(),
    };
  }
  @Get('/sub-categories')
  async findSubCategories(
    @Query('categoryId', ParseIntPipe) categoryId: number,
  ) {
    return {
      success: true,
      data: await this.categoryService.getAllSubCategories(categoryId),
    };
  }
  @Get('custom-fields')
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
}
