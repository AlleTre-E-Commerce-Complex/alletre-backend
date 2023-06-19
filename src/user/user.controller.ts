import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { UserService } from './user.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Account } from '../auth/decorators/account.decorator';
import { ChangePasswordDTO, LocationDTO, UpdatePersonalInfoDTO } from './dtos';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaginationDTO } from 'src/auction/dtos';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Role } from 'src/auth/enums/role.enum';
import { Roles } from 'src/auth/decorators/roles.decorator';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('my-profile')
  @UseGuards(AuthGuard)
  async getUserProfileController(@Account() account: any) {
    return {
      success: true,
      data: await this.userService.findUserProfileByIdOr404(account.id),
    };
  }

  @Get('my-locations')
  @UseGuards(AuthGuard)
  async getUserLocationsController(@Account() account: any) {
    return {
      success: true,
      data: await this.userService.getAllUserLocations(account.id),
    };
  }

  @Get('admin/all')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async getAllUsers(
    @Query() paginationDTO: PaginationDTO,
    @Query('name') name: string,
  ) {
    return {
      success: true,
      data: await this.userService.getAllUsers(paginationDTO, name),
    };
  }
  @Post('locations')
  @UseGuards(AuthGuard)
  async addNewLocationController(
    @Account() account: any,
    @Body() locationDTO: LocationDTO,
  ) {
    return {
      success: true,
      data: await this.userService.addNewLocation(account.id, locationDTO),
    };
  }

  @Put('personal-info')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('image', { dest: 'uploads/' }))
  async updatePersonalInfo(
    @Account() account: any,
    @Body() updatePersonalInfoDTO: UpdatePersonalInfoDTO,
    @UploadedFile()
    image?: Express.Multer.File,
  ) {
    return {
      success: true,
      data: await this.userService.updatePersonalInfo(
        Number(account.id),
        updatePersonalInfoDTO,
        image,
      ),
    };
  }
  @Put('credentials-info')
  @UseGuards(AuthGuard)
  async updatePassword(
    @Account() account: any,
    @Body() changePasswordDTO: ChangePasswordDTO,
  ) {
    return {
      success: true,
      data: await this.userService.changePassword(
        Number(account.id),
        changePasswordDTO,
      ),
    };
  }
  @Put('locations/:locationId')
  @UseGuards(AuthGuard)
  async updateUserLocation(
    @Account() account: any,
    @Body() locationDTO: LocationDTO,
    @Param('locationId', ParseIntPipe) locationId: number,
  ) {
    return {
      success: true,
      data: await this.userService.updateUserLocation(
        Number(account.id),
        locationId,
        locationDTO,
      ),
    };
  }

  @Delete('locations/:locationId')
  @UseGuards(AuthGuard)
  async deleteLocationById(
    @Account() account: any,
    @Param('locationId', ParseIntPipe) locationId: number,
  ) {
    return {
      success: true,
      data: await this.userService.deleteLocationById(
        Number(account.id),
        locationId,
      ),
    };
  }
  @Patch('locations/:locationId/set-main')
  @UseGuards(AuthGuard)
  async setLocationAsMainLocation(
    @Account() account: any,
    @Param('locationId', ParseIntPipe) locationId: number,
  ) {
    await this.userService.setLocationAsMainLocation(
      Number(account.id),
      locationId,
    );
    return {
      success: true,
    };
  }
}
