import { Injectable, BadRequestException } from '@nestjs/common';
import { NotFoundResponse } from 'src/common/errors';
import { PrismaService } from 'src/prisma/prisma.service';
import { FirebaseService } from 'src/firebase/firebase.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly firebaseService: FirebaseService,
  ) {}

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

  async searchProducts(query: string) {
    return this.prismaService.product.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { id: !isNaN(Number(query)) ? Number(query) : undefined },
        ],
      },
      select: {
        id: true,
        title: true,
        images: { take: 1 },
        user: {
          select: {
            userName: true,
            phone: true,
          },
        },
        listedProducts: {
          select: {
            location: true,
          },
        },
      },
      take: 20,
    });
  }

  async deleteComment(commentId: number) {
    return this.prismaService.$transaction(async (tx: any) => {
      // 1. Get all reply IDs
      const replies = await tx.comment.findMany({
        where: { parentId: commentId },
        select: { id: true },
      });
      const replyIds = replies.map((r) => r.id);

      // 2. Delete likes for replies
      if (replyIds.length > 0) {
        await tx.commentLike.deleteMany({
          where: { commentId: { in: replyIds } },
        });
      }

      // 3. Delete likes for the parent comment
      await tx.commentLike.deleteMany({
        where: { commentId },
      });

      // 4. Delete replies
      if (replyIds.length > 0) {
        await tx.comment.deleteMany({
          where: { id: { in: replyIds } },
        });
      }

      // 5. Delete the parent comment
      return tx.comment.delete({
        where: { id: commentId },
      });
    });
  }

  async updateProductLocation(productId: number, updateDto: any) {
    const { address, phone, lat, lng, cityId, countryId } = updateDto;

    // Find the listed product to get its locationId
    const listedProduct = await this.prismaService.listedProducts.findUnique({
      where: { productId },
      include: { location: true, product: true },
    });

    if (!listedProduct) {
      throw new NotFoundResponse({
        en: 'Listed product not found',
        ar: 'المنتج المدرج غير موجود',
      });
    }

    if (listedProduct.locationId) {
      // Update existing location
      return this.prismaService.location.update({
        where: { id: listedProduct.locationId },
        data: {
          address: address !== undefined ? address : undefined,
          phone: phone !== undefined ? phone : undefined,
          lat: lat !== undefined ? parseFloat(lat.toString()) : undefined,
          lng: lng !== undefined ? parseFloat(lng.toString()) : undefined,
          cityId: cityId !== undefined ? Number(cityId) : undefined,
          countryId: countryId !== undefined ? Number(countryId) : undefined,
        },
      });
    } else {
      // Create new location and link it
      // Use the listedProduct's userId (should be the company account)
      const newLocation = await this.prismaService.location.create({
        data: {
          userId: listedProduct.userId,
          address: address || '',
          phone: phone || '',
          lat: lat ? parseFloat(lat.toString()) : 0,
          lng: lng ? parseFloat(lng.toString()) : 0,
          cityId: cityId ? Number(cityId) : 1, // Fallback to 1 if not provided
          countryId: countryId ? Number(countryId) : 1, // Fallback to 1 if not provided
        },
      });

      await this.prismaService.listedProducts.update({
        where: { id: listedProduct.id },
        data: { locationId: newLocation.id },
      });

      return newLocation;
    }
  }

  async getObjections() {
    return this.prismaService.productObjection.findMany({
      include: {
        product: {
          include: {
            images: { take: 1 },
            user: {
              select: { id: true, userName: true, email: true, phone: true },
            },
          },
        },
        user: {
          select: { id: true, userName: true, email: true, phone: true },
        },
        repliedBy: {
          select: { id: true, userName: true, email: true, phone: true, imageLink: true },
        },
        documents: true,
        replyDocuments: true,
        finalDecisionDocuments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateObjectionStatus(id: number, status: any) {
    return this.prismaService.productObjection.update({
      where: { id },
      data: { status },
    });
  }

  async submitFinalDecision(id: number, finalDecision: string, files?: Array<Express.Multer.File>) {
    if (!finalDecision || !finalDecision.trim()) {
      throw new BadRequestException('Final decision text is required');
    }

    const existingObjection = await this.prismaService.productObjection.findUnique({
      where: { id },
    });

    if (!existingObjection) {
      throw new BadRequestException('Objection not found');
    }

    await this.prismaService.productObjection.update({
      where: { id },
      data: {
        finalDecision: finalDecision.trim(),
        finalDecisionAt: new Date(),
        status: 'SOLVED',
      },
    });

    if (files?.length) {
      for (const file of files) {
        const uploadedFile = await this.firebaseService.uploadImage(file);
        await this.prismaService.productObjectionFinalDecisionImage.create({
          data: {
            objectionId: id,
            imageLink: uploadedFile.fileLink,
            imagePath: uploadedFile.filePath,
          },
        });
      }
    }

    const updatedObjection = await this.prismaService.productObjection.findUnique({
      where: { id },
      include: {
        product: true,
        user: true,
        finalDecisionDocuments: true,
      },
    });

    return updatedObjection;
  }

  async deleteFinalDecision(id: number) {
    const existingObjection = await this.prismaService.productObjection.findUnique({
      where: { id },
    });

    if (!existingObjection) {
      throw new BadRequestException('Objection not found');
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.productObjectionFinalDecisionImage.deleteMany({
        where: { objectionId: id },
      });

      await tx.productObjection.update({
        where: { id },
        data: {
          finalDecision: null,
          finalDecisionAt: null,
          status: existingObjection.repliedAt ? 'IN_PROGRESS' : 'PENDING',
        },
      });
    });

    return this.prismaService.productObjection.findUnique({
      where: { id },
      include: {
        product: true,
        user: true,
        finalDecisionDocuments: true,
      },
    });
  }

  async deleteFinalDecisionDocument(docId: number) {
    const doc = await this.prismaService.productObjectionFinalDecisionImage.findUnique({
      where: { id: docId },
    });

    if (!doc) {
      throw new BadRequestException('Document not found');
    }

    return this.prismaService.productObjectionFinalDecisionImage.delete({
      where: { id: docId },
    });
  }
}
