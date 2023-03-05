import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.category.create({
    data: {
      nameAr: 'الأجهزة الكهربائية',
      nameEn: 'Electronic Devices',
      hasUsageCondition: true,
      subCategories: {
        createMany: {
          data: [
            {
              nameAr: 'أجهزة الكمبيوتر والأجهزة اللوحية',
              nameEn: 'Computers & tablets',
            },
            { nameAr: 'الكاميرات والصور', nameEn: 'Cameras & photos' },
            { nameAr: 'التلفزيونات والصوتيات', nameEn: 'TVs & Audios' },
            {
              nameAr: 'الهواتف المحمولة وملحقاتها',
              nameEn: 'Cell phones & Accessors',
            },
          ],
        },
      },
    },
  });

  await prisma.category.create({
    data: {
      nameAr: 'مجوهرات',
      nameEn: 'Jewelry',
      hasUsageCondition: true,
      subCategories: {
        createMany: {
          data: [
            {
              nameAr: 'ذهب',
              nameEn: 'Gold',
            },
            { nameAr: 'الماس', nameEn: 'Diamond' },
            { nameAr: 'فضة', nameEn: 'Silver' },
          ],
        },
      },
    },
  });

  await prisma.category.create({
    data: {
      nameAr: 'ملكيات',
      nameEn: 'Properties',
      subCategories: {
        createMany: {
          data: [
            {
              nameAr: 'منزل',
              nameEn: 'House',
            },
            { nameAr: 'تاون هاوس', nameEn: 'Townhouse' },
            { nameAr: 'وحدة', nameEn: 'Unit' },
            { nameAr: 'فيلا', nameEn: 'Villa' },
            { nameAr: 'أرض', nameEn: 'Land' },
            { nameAr: 'مكتب', nameEn: 'Office' },
          ],
        },
      },
    },
  });

  await prisma.category.create({
    data: {
      nameAr: 'سيارات',
      nameEn: 'Cars',
      hasUsageCondition: true,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
