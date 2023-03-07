import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RegionsService } from './regions.service';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('regions')
export class RegionsController {
  constructor(private regionsService: RegionsService) {}

  @Get('countries')
  @UseGuards(AuthGuard)
  async getAllCountriesController() {
    return {
      success: true,
      data: await this.regionsService.getAllCountries(),
    };
  }

  @Get('cities')
  @UseGuards(AuthGuard)
  async getAllCitiesController(@Query('countryId') countryId: number) {
    return {
      success: true,
      data: await this.regionsService.getAllCities(Number(countryId)),
    };
  }
}
