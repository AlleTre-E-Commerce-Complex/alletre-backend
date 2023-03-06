import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Account } from '../auth/decorators/account.decorator';
import { LocationDTO } from './dtos';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('my-profile')
  @UseGuards(AuthGuard)
  async getUserProfileController(@Account() account: any) {
    return {
      success: true,
      data: await this.userService.findUserByIdOr404(account.id),
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
}
