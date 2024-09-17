import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RegionsService } from './regions.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthOrGuestGuard } from 'src/auth/guards/authOrGuest.guard';

@Controller('regions')
export class RegionsController {
  constructor(private regionsService: RegionsService) {}

  @Get('countries')
  @UseGuards(AuthOrGuestGuard)
  async getAllCountriesController() { 
    return {
      success: true, 
      data: await this.regionsService.getAllCountries(),
    };
  }

  @Get('cities')
  @UseGuards(AuthOrGuestGuard)
  async getAllCitiesController(@Query('countryId') countryId: number) {
    return {
      success: true,
      data: await this.regionsService.getAllCities(Number(countryId)),
    };
  }
}
