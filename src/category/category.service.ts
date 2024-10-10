import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fsPomises from 'fs/promises';
import { MethodNotAllowedResponse, NotFoundResponse } from 'src/common/errors';
import { FirebaseService } from 'src/firebase/firebase.service';
@Injectable()
export class CategoryService {
  constructor(
    private prismaService: PrismaService,
    private firebaseService: FirebaseService,
  ) {}

  async getAllCategories() {
    return await this.prismaService.category.findMany({});
  }

  async getAllCategoriesIncludeSub() {
    return await this.prismaService.category.findMany({
      include: { subCategories: true },
    });
  }

  async findParticularCatergory(categoryId?: number) {
    try {
      return await this.prismaService.category.findUnique({
        where: { id:categoryId },
      });
    } catch (error) {
      console.log('Error when finding the category data :',error)
    }
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

  async getAllBrands(categoryId?: number) {
    return await this.prismaService.brand.findMany({
      where: { ...(categoryId ? { categoryId: Number(categoryId) } : {}) },
    });
  }

  async uploadImagesForCategory(
    categoryId: number,
    banner?: Express.Multer.File,
    slider?: Express.Multer.File,
  ) {
    console.log(banner, slider);

    const category = await this.prismaService.category.findUnique({
      where: { id: categoryId },
    });
    if (!category)
      throw new NotFoundResponse({
        en: 'Category Not Found',
        ar: 'لا يوجد هذا العنصر',
      });

    let bannerLink: string,
      bannerPath: string,
      sliderLink: string,
      sliderPath: string;

    // Upload Images
    if (banner) {
      const { fileLink, filePath } = await this.firebaseService.uploadImage(
        banner,
      );
      bannerLink = fileLink;
      bannerPath = filePath;
    }
    if (slider) {
      const { fileLink, filePath } = await this.firebaseService.uploadImage(
        slider,
      );

      sliderLink = fileLink;
      sliderPath = filePath;
    }

    await this.prismaService.category.update({
      where: { id: categoryId },
      data: {
        ...(bannerLink ? { bannerLink, bannerPath } : {}),
        ...(sliderLink ? { sliderLink, sliderPath } : {}),
      },
    });
  }

  async uploadImageForSubCategory(
    subCategoryId: number,
    image: Express.Multer.File,
  ) {
    const subCategory = await this.prismaService.subCategory.findUnique({
      where: { id: subCategoryId },
    });
    if (!subCategory)
      throw new NotFoundResponse({
        en: 'subCategory Not Found',
        ar: 'لا يوجد هذا العنصر',
      });

    // Upload Images
    if (!image)
      throw new MethodNotAllowedResponse({
        ar: 'قم برفع الصورة',
        en: 'Upload Image',
      });

    const { fileLink, filePath } = await this.firebaseService.uploadImage(
      image,
    );

    await this.prismaService.subCategory.update({
      where: { id: subCategoryId },
      data: {
        imageLink: fileLink,
        imagePath: filePath,
      },
    });
  }
}
