import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoryService {
  constructor(private prismaService: PrismaService) {}

  async getAllCategories() {
    return await this.prismaService.category.findMany({
      include: { subCategories: true },
    });
  }

  async getAllSubCategories(categoryId?: number) {
    return await this.prismaService.subCategory.findMany({
      where: { ...(categoryId ? { categoryId: categoryId } : {}) },
      include: { customFields: true },
    });
  }

  async getCustomFields(categoryId?: number, subCategoryId?: number) {
    const customFieldsFilter = categoryId
      ? { categoryId: Number(categoryId) }
      : { subCategoryId: Number(subCategoryId) };

    return await this.prismaService.customFields.findMany({
      where: { ...customFieldsFilter },
    });
  }
}
