// src/app-version/app-version.controller.ts
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AppVersionService } from './version.service';
import { GetVersionQuery } from './dto/app-version.dto';
import { CreateAppVersionDto } from './dto/create-version.dto';
import { UpdateAppVersionDto } from './dto/update-version.dto';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Role } from 'src/auth/enums/role.enum';
import { Roles } from 'src/auth/decorators/roles.decorator';

@Controller('appVersion')
export class AppVersionController {
  constructor(private readonly svc: AppVersionService) {}

  @Get()
  async get(@Query() q: GetVersionQuery) {
    const platform =
      q.platform?.toLowerCase() === 'android' ? 'android' : 'ios';
    const info = await this.svc.getVersionInfo(platform as 'ios' | 'android');

    const evalRes = this.svc.evaluateClientVersion(q.currentVersion, info);

    return {
      platform: info.platform,
      latestVersion: info.latestVersion,
      minSupportedVersion: info.minSupportedVersion,
      forceUpdate: evalRes.forceUpdate,
      releaseNotes: info.releaseNotes,
      downloadUrl: info.downloadUrl,
      updateAvailable: evalRes.updateAvailable,
      mustUpdate: evalRes.mustUpdate,
    };
  }

  @Get('latest')
  async getLatest(@Query() q: GetVersionQuery) {
    const platform =
      q.platform?.toLowerCase() === 'android' ? '"android"' : '"ios"';
    const info = await this.svc.getLatest(platform as 'ios' | 'android');
    return info;
  }

  @Post()
  // @UseGuards(AuthGuard, RolesGuard)
  // @Roles(Role.Admin)
  create(@Body() dto: CreateAppVersionDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAppVersionDto) {
    return this.svc.update(id, dto);
  }

  @Get('list')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  list(@Query('platform') platform?: string) {
    return this.svc.list(platform);
  }

}
