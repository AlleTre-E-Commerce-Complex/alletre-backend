import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RegionsService {
  constructor(private prismaService: PrismaService) {}

  async getAllCountries() {
    return await this.prismaService.country.findMany();
  }

  async getAllCities(countryId?: number) {
    return await this.prismaService.city.findMany({
      where: { ...(countryId ? { countryId: Number(countryId) } : {}) },
    });
  }
}
