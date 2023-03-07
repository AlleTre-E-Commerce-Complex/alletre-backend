import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fsPomises from 'fs/promises';
import { MethodNotAllowedResponse } from 'src/common/errors';
@Injectable()
export class CategoryService {
  constructor(private prismaService: PrismaService) {}

  async getAllCategories() {
    return await this.prismaService.category.findMany({});
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

    const categoryCustomFields = await this.prismaService.customFields.findMany(
      {
        where: { ...customFieldsFilter },
      },
    );

    const customFieldsResponse = {
      arrayCustomFields: categoryCustomFields.filter((customField) => {
        if (customField.type === 'array') return customField;
      }),
      regularCustomFields: categoryCustomFields.filter((customField) => {
        if (customField.type !== 'array')
          if (customField.key !== 'model') return customField;
      }),
      model: categoryCustomFields.filter((customField) => {
        if (customField.key === 'model') return customField;
      })[0],
    };

    return customFieldsResponse;
  }

  async getSystemCustomFields() {
    let customFields: string;
    try {
      customFields = await fsPomises.readFile(
        `${process.cwd()}/src/category/system-fields.json`,
        'utf-8',
      );
    } catch (error) {
      console.log(error);
      throw new MethodNotAllowedResponse({
        ar: 'خطأ في قراءة الملف',
        en: 'Error While Reading File',
      });
    }
    return JSON.parse(customFields);
  }
}
