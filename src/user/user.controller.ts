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
import { SubscribeDto } from './dtos/subscribers.dto';
import * as xlsx from 'xlsx';
import { ProblemStatus } from '@prisma/client';

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

  @Post('/non-registered-users/upload-excel')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(AuthGuard, RolesGuard)
  async uploadExcelFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('categoryId') categoryId: string,
  ) {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const allSheetsData = [];

    workbook.SheetNames.forEach((sheetName) => {
      const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
      allSheetsData.push(...sheetData); // Merge all sheets into one array
    });

    return this.userService.saveExcelData(allSheetsData, parseInt(categoryId));
  }

  // @Get('/non-registered-users/get')
  // @UseGuards(AuthGuard, RolesGuard)
  // async getNonRegisteredUsers(){
  //   return {
  //     success:true,
  //     data: await this.userService.getAllNonRegisteredUsers()
  //   }
  // }

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
    console.log('getAllUsers : ', paginationDTO);
    return {
      success: true,
      data: await this.userService.getAllUsers(paginationDTO, name),
    };
  }

  @Get('admin/get-user-complaints')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async getAllUsersComplaints() {
    // @Query('name') name: string, // @Query() paginationDTO: PaginationDTO,
    return {
      success: true,
      data: await this.userService.getAllUsersComplaints(),
    };
  }

  @Patch('/admin/update-complait-status')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async updateBankTransferRequestsByAdmin(
    @Query('complaintId') complaintId: string,
    @Body('status') status: ProblemStatus,
  ) {
    const bankTransferRequestData =
      await this.userService.updateUserComplaitStatus(
        Number(complaintId),
        status,
      );

    return {
      success: true,
      data: bankTransferRequestData,
    };
  }

  @Get('/non-registered-users/get')
  @UseGuards(AuthGuard, RolesGuard)
  async getNonRegisteredUsers(
    @Query() paginationDTO: PaginationDTO,
    @Query('name') name: string,
  ) {
    console.log('getAllUsers : ', paginationDTO);
    return {
      success: true,
      data: await this.userService.getAllNonRegisteredUsers(
        paginationDTO,
        name,
      ),
    };
  }

  @Post('locations')
  @UseGuards(AuthGuard)
  async addNewLocationController(
    @Account() account: any,
    @Body() locationDTO: LocationDTO,
  ) {
    console.log('locationDto', locationDTO);
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

  @Patch('locations/:locationId/make-default')
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
  @Post('/subscribers/create')
  async subscribeToNewsletter(@Body() subscribeDto: SubscribeDto) {
    return {
      success: true,
      data: await this.userService.addNewSubscriber(subscribeDto.email),
    };
  }
  @Put('/subscribers/unSubscribe')
  async unSubscribe(@Body() subscribeDto: SubscribeDto) {
    return {
      success: true,
      data: await this.userService.unSubscribeUser(subscribeDto.email),
    };
  }

  @Patch('/admin/updateUserBlockStatus')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async getAllAuctionsByAdmin(
    @Query('userId') userId: number,
    @Query('currentStatus') currentStatus: boolean,
  ) {
    const data = await this.userService.updateBlockStatus(
      userId,
      currentStatus,
    );

    return {
      success: true,
      data,
    };
  }

  @Get('/updateUserBlockStatus')
  @Patch('/updateUserBlockStatus')
  @UseGuards(AuthGuard)
  @Roles(Role.User)
  async blockOrDeleteUserAccount(
    @Account() account: any,
    @Query('currentStatus') currentStatus: boolean,
  ) {
    const data = await this.userService.updateBlockStatus(
      account.id,
      currentStatus,
    );

    return {
      success: true,
      data,
    };
  }
}
