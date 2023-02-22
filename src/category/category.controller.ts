import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { CategoryService } from './category.service';

@Controller('categories')
export class CategoryController {
  constructor(private categoryService: CategoryService) {}

  @Get('all')
  async findCategories() {
    return {
      success: true,
      data: await this.categoryService.findAllCategories(),
    };
  }
  @Get('/sub-categories')
  async findSubCategories(
    @Query('categoryId', ParseIntPipe) categoryId: number,
  ) {
    return {
      success: true,
      data: await this.categoryService.findAllSubCategories(categoryId),
    };
  }
}
