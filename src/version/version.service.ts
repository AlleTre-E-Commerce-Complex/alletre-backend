// src/app-version/app-version.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { isLessThan } from './semver.util';
import { CreateAppVersionDto } from './dto/create-version.dto';
import { UpdateAppVersionDto } from './dto/update-version.dto';

@Injectable()
export class AppVersionService {
  constructor(private prisma: PrismaService) {}

  // returns an object with keys: latestVersion, minSupportedVersion, releaseNotes, downloadUrl
  async getVersionInfo(platform: 'ios' | 'android') {
    // fetch latest and minSupported for the platform
    const [latest, minSupported] = await Promise.all([
      this.prisma.appVersion.findFirst({
        where: { platform, isLatest: true },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.appVersion.findFirst({
        where: { platform, isMinSupported: true },
        orderBy: { createdAt: 'desc' }
      }),
    ]);

    if (!latest && !minSupported) {
      throw new NotFoundException('No version info found for platform');
    }

    // fallback: if one missing, use the other
    const latestVersion = latest?.version ?? minSupported!.version;
    const minVersion = minSupported?.version ?? latestVersion;

    return {
      platform,
      latestVersion,
      minSupportedVersion: minVersion,
      releaseNotes: latest?.releaseNotes ?? '',
      downloadUrl: latest?.downloadUrl ?? ''
    };
  }

  // helper: evaluate update status for a given client version
  evaluateClientVersion(currentVersion: string | undefined, info: any) {
    const res = {
      updateAvailable: false,
      mustUpdate: false,
      forceUpdate: false,
    };

    if (!currentVersion) {
      // if mobile doesn't send currentVersion, we still return info, but cannot compute booleans
      return res;
    }

    if (isLessThan(currentVersion, info.latestVersion)) {
      res.updateAvailable = true;
    }
    if (isLessThan(currentVersion, info.minSupportedVersion)) {
      res.mustUpdate = true;
    }
    res.forceUpdate = info.latestVersion === info.minSupportedVersion;
    return res;
  }

  async create(dto: CreateAppVersionDto) {
    // if isLatest or isMinSupported flags set, do a transaction to unset others
    return await this.prisma.$transaction(async (tx) => {
      if (dto.isLatest) {
        await tx.appVersion.updateMany({
          where: { platform: dto.platform, isLatest: true },
          data: { isLatest: false },
        });
      }
      if (dto.isMinSupported) {
        await tx.appVersion.updateMany({
          where: { platform: dto.platform, isMinSupported: true },
          data: { isMinSupported: false },
        });
      }

      const created = await tx.appVersion.create({
        data: {
          platform: dto.platform,
          version: dto.version,
          isLatest: !!dto.isLatest,
          isMinSupported: !!dto.isMinSupported,
          releaseNotes: dto.releaseNotes,
          downloadUrl: dto.downloadUrl,
        },
      });
      return created;
    });
  }
  async update(id: number, dto: UpdateAppVersionDto) {
    return await this.prisma.$transaction(async (tx) => {
      // fetch row first
      const row = await tx.appVersion.findUnique({ where: { id } });
      if (!row) throw new Error('Not found');

      if (dto.isLatest) {
        await tx.appVersion.updateMany({
          where: { platform: row.platform, isLatest: true },
          data: { isLatest: false },
        });
      }
      if (dto.isMinSupported) {
        await tx.appVersion.updateMany({
          where: { platform: row.platform, isMinSupported: true },
          data: { isMinSupported: false },
        });
      }

      const updated = await tx.appVersion.update({
        where: { id },
        data: {
          version: dto.version ?? row.version,
          isLatest: dto.isLatest ?? row.isLatest,
          isMinSupported: dto.isMinSupported ?? row.isMinSupported,
          releaseNotes: dto.releaseNotes ?? row.releaseNotes,
          downloadUrl: dto.downloadUrl ?? row.downloadUrl,
        },
      });
      return updated;
    });
  }

  async list(platform?: string) {
    return this.prisma.appVersion.findMany({
      where: platform ? { platform } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLatest(platform: 'ios' | 'android', _AndroidAppUpdateURL, _IOSAppUpdateURL) {
    try {
      const latestIos = await this.prisma.appVersion.findFirst({
        where: { platform: 'ios'},
        orderBy: { createdAt: 'desc' },
      });
      const latestAndroid = await this.prisma.appVersion.findFirst({
        where: { platform: 'android' },
        orderBy: { createdAt: 'desc' },
      });
      return {
        LatestAndroidVersion :  latestAndroid.version,
        LatestIOSVersion : latestIos.version,
        IOSAppUpdateURL : _AndroidAppUpdateURL? _AndroidAppUpdateURL : latestIos.downloadUrl,
        AndroidAppUpdateURL : _IOSAppUpdateURL? _IOSAppUpdateURL : latestAndroid.downloadUrl,
      };
    } catch (error) {
      throw new NotFoundException('No version info found')
    }
  }
}
