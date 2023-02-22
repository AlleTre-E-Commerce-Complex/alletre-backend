import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoryService {
  constructor(private prismaService: PrismaService) {}

  async findAllCategories() {
    return await this.prismaService.category.findMany();
  }

  async findAllSubCategories(categoryId?: number) {
    return await this.prismaService.subCategory.findMany({
      where: { ...(categoryId ? { categoryId: categoryId } : {}) },
    });
  }
}
