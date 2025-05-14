import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { AuthOrGuestGuard } from 'src/auth/guards/authOrGuest.guard';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import { MethodNotAllowedResponse } from 'src/common/errors';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Role } from 'src/auth/enums/role.enum';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CreateCategoryDTO } from './categoryDTO';

@Controller('categories')
export class CategoryController {
  constructor(private categoryService: CategoryService) {}

  @Get('/all')
  @UseGuards(AuthOrGuestGuard)
  async findCategories() {
    return {
      success: true,
      data: await this.categoryService.getAllCategories(),
    };
  }

  @Get('/brands')
  @UseGuards(AuthOrGuestGuard)
  async getAllBrands(@Query('categoryId') categoryId: number) {
    return {
      success: true,
      data: await this.categoryService.getAllBrands(categoryId),
    };
  }

  @Get('/home')
  @UseGuards(AuthOrGuestGuard)
  async findCategoriesIncludeSub() {
    return {
      success: true,
      data: await this.categoryService.getAllCategoriesIncludeSub(),
    };
  }
  @Get('/getParticularCatergory')
  @UseGuards(AuthOrGuestGuard)
  async findParticularCatergory(
    @Query('categoryId', ParseIntPipe) categoryId: number,
  ) {
    return {
      success: true,
      data: await this.categoryService.findParticularCatergory(categoryId),
    };
  }

  @Post('/createNewCategory')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async createNewCategory(@Body() body: CreateCategoryDTO) {
    return {
      success: true,
      data: await this.categoryService.addNewCategory(body),
    };
  }

  @Put('/editCategory/:categoryId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async editCategory(
    @Body() body: CreateCategoryDTO,
    @Param('categoryId', ParseIntPipe) categoryId: number,
  ) {
    console.log('===>111 edit', body);
    return {
      success: true,
      data: await this.categoryService.updateCategory(body, categoryId),
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
  @Get('/custom-fields')
  @UseGuards(AuthOrGuestGuard)
  async getCustomFieldsController(
    @Query('categoryId') categoryId: number,
    @Query('subCategoryId') subCategoryId: number,
  ) {
    console.log('categoryId***', categoryId);
    console.log('subCategoryId***', subCategoryId);
    return {
      success: true,
      data: await this.categoryService.getCustomFields(
        categoryId,
        subCategoryId,
      ),
    };
  }

  @Get('/system-fields')
  @UseGuards(AuthOrGuestGuard)
  async getSystemFieldsController() {
    return {
      success: true,
      data: await this.categoryService.getSystemCustomFields(),
    };
  }

  @Get('/getOne/:categoryId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async getCategoryDataById(
    @Param('categoryId', ParseIntPipe) categoryId: number,
  ) {
    return {
      success: true,
      data: await this.categoryService.findParticularCatergory(categoryId),
    };
  }

  @Put('/:categoryId/upload-images')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'banner', maxCount: 1 },
        { name: 'slider', maxCount: 1 },
        // { name: 'bannerAr', maxCount: 1 },
        // { name: 'sliderAr', maxCount: 1 },
      ],
      { dest: 'uploads/' },
    ),
  )
  async uploadImagesForCategories(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @UploadedFiles()
    files: {
      banner?: Express.Multer.File[];
      slider?: Express.Multer.File[];
      // bannerAr?: Express.Multer.File[];
      // sliderAr?: Express.Multer.File[];
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
        files.banner?.length ? files.banner[0] : undefined,
        files.slider?.length ? files.slider[0] : undefined,
        // files.bannerAr?.length ? files.bannerAr[0] : undefined,
        // files.sliderAr?.length ? files.sliderAr[0] : undefined,
      ),
    };
  }

  @Put('/sub-categories/:subCategoryId/upload-images')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('image', { dest: 'uploads/' }))
  async uploadImagesForSubCategory(
    @Param('subCategoryId', ParseIntPipe) subCategoryId: number,
    @UploadedFile() image: Express.Multer.File,
  ) {
    return {
      success: true,
      data: await this.categoryService.uploadImageForSubCategory(
        subCategoryId,
        image,
      ),
    };
  }
}
