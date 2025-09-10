import { Injectable } from '@nestjs/common';
import { NotFoundResponse } from 'src/common/errors';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prismaService: PrismaService) {}

  async getAdminByEmailOr404(email: string) {
    console.log('ethi');
    const admin = await this.prismaService.admin.findFirst({
      where: { email },
    });

    if (!admin)
      throw new NotFoundResponse({
        en: 'Email Is Not Registered',
        ar: 'الحساب غيري مسجل من قبل',
      });

    return admin;
  }

  async getAdminByIdOr404(id: number) {
    const admin = await this.prismaService.admin.findUnique({
      where: { id },
    });

    if (!admin)
      throw new NotFoundResponse({
        en: 'Email Is Not Registered',
        ar: 'الحساب غيري مسجل من قبل',
      });

    return admin;
  }

  // Exclude keys from admin
  exclude<Admin, Key extends keyof any>(
    admin: any,
    keys: Key[],
  ): Omit<Admin, Key> {
    for (const key of keys) {
      delete admin[key];
    }
    return admin;
  }
}
