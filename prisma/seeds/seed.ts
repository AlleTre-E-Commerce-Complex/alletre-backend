import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.category.create({
    data: {
      nameAr: 'الأجهزة الكهربائية',
      nameEn: 'Electronic Devices',
      hasUsageCondition: true,
      subCategories: {
        create: [
          {
            nameAr: 'أجهزة الكمبيوتر والأجهزة اللوحية',
            nameEn: 'Computers & tablets',
            customFields: {
              create: [
                {
                  key: 'screenSize',
                  type: 'array',
                  labelAr: 'حجم الشاشة',
                  labelEn: 'Screen Size',
                },
                {
                  key: 'operatingSystem',
                  type: 'text',
                  labelAr: 'نظام التشغيل',
                  labelEn: 'Operatin System',
                },
                {
                  key: 'releaseYear',
                  type: 'text',
                  labelAr: 'سنة الاصدار',
                  labelEn: 'Release Year',
                },
                {
                  key: 'color',
                  type: 'array',
                  labelAr: 'اللون',
                  labelEn: 'Color',
                },
                {
                  key: 'regionOfManufacture',
                  type: 'text',
                  labelAr: 'منظقة المنشأ',
                  labelEn: 'Region Of Manufacture',
                },
                {
                  key: 'ramSize',
                  type: 'number',
                  labelAr: 'حجم الرامات',
                  labelEn: 'Region Of Manufacture',
                },
                {
                  key: 'processor',
                  type: 'text',
                  labelAr: 'بروسيسور',
                  labelEn: 'Processor',
                },
              ],
            },
          },
          {
            nameAr: 'الكاميرات والصور',
            nameEn: 'Cameras & photos',
            customFields: {
              create: [
                {
                  key: 'releaseYear',
                  type: 'text',
                  labelAr: 'سنة الاصدار',
                  labelEn: 'Release Year',
                },
                {
                  key: 'color',
                  type: 'array',
                  labelAr: 'اللون',
                  labelEn: 'Color',
                },
                {
                  key: 'regionOfManufacture',
                  type: 'text',
                  labelAr: 'منظقة المنشأ',
                  labelEn: 'Region Of Manufacture',
                },
                {
                  key: 'cameraType',
                  type: 'array',
                  labelAr: 'نوع الكاميرا',
                  labelEn: 'Camera Type',
                },
              ],
            },
          },
          {
            nameAr: 'التلفزيونات والصوتيات',
            nameEn: 'TVs & Audios',
            customFields: {
              create: [
                {
                  key: 'screenSize',
                  type: 'array',
                  labelAr: 'حجم الشاشة',
                  labelEn: 'Screen Size',
                },
                {
                  key: 'releaseYear',
                  type: 'text',
                  labelAr: 'سنة الاصدار',
                  labelEn: 'Release Year',
                },
                {
                  key: 'color',
                  type: 'array',
                  labelAr: 'اللون',
                  labelEn: 'Color',
                },
                {
                  key: 'regionOfManufacture',
                  type: 'text',
                  labelAr: 'منظقة المنشأ',
                  labelEn: 'Region Of Manufacture',
                },
              ],
            },
          },
          {
            nameAr: 'الهواتف المحمولة وملحقاتها',
            nameEn: 'Cell phones & Accessors',
            customFields: {
              create: [
                {
                  key: 'screenSize',
                  type: 'array',
                  labelAr: 'حجم الشاشة',
                  labelEn: 'Screen Size',
                },
                {
                  key: 'operatingSystem',
                  type: 'text',
                  labelAr: 'نظام التشغيل',
                  labelEn: 'Operatin System',
                },
                {
                  key: 'releaseYear',
                  type: 'text',
                  labelAr: 'سنة الاصدار',
                  labelEn: 'Release Year',
                },
                {
                  key: 'color',
                  type: 'array',
                  labelAr: 'اللون',
                  labelEn: 'Color',
                },
                {
                  key: 'regionOfManufacture',
                  type: 'text',
                  labelAr: 'منظقة المنشأ',
                  labelEn: 'Region Of Manufacture',
                },
                {
                  key: 'material',
                  type: 'array',
                  labelAr: 'نوع المادة',
                  labelEn: 'Material',
                },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.category.create({
    data: {
      nameAr: 'مجوهرات',
      nameEn: 'Jewelry',
      hasUsageCondition: true,
      subCategories: {
        create: [
          {
            nameAr: 'ذهب',
            nameEn: 'Gold',
          },
          { nameAr: 'الماس', nameEn: 'Diamond' },
          { nameAr: 'فضة', nameEn: 'Silver' },
        ],
      },
    },
  });

  await prisma.category.create({
    data: {
      nameAr: 'ملكيات',
      nameEn: 'Properties',
      subCategories: {
        create: [
          {
            nameAr: 'منزل',
            nameEn: 'House',
            customFields: {
              create: [
                {
                  key: 'countryId',
                  type: 'array',
                  labelAr: 'الدولة',
                  labelEn: 'Country',
                },
                {
                  key: 'cityId',
                  type: 'array',
                  labelAr: 'المدينة',
                  labelEn: 'City',
                },
                {
                  key: 'age',
                  type: 'number',
                  labelAr: 'العمر',
                  labelEn: 'Age',
                },
                {
                  key: 'numberOfRooms',
                  type: 'number',
                  labelAr: 'عدد الغرف',
                  labelEn: 'Number Of Rooms',
                },
                {
                  key: 'totalArea',
                  type: 'number',
                  labelAr: 'المساحة الكلية',
                  labelEn: 'Total Area',
                },
                {
                  key: 'numberOfFloors',
                  type: 'number',
                  labelAr: 'عدد الطوابق',
                  labelEn: 'Number Of Floors',
                },
              ],
            },
          },
          {
            nameAr: 'تاون هاوس',
            nameEn: 'Townhouse',
            customFields: {
              create: [
                {
                  key: 'countryId',
                  type: 'array',
                  labelAr: 'الدولة',
                  labelEn: 'Country',
                },
                {
                  key: 'cityId',
                  type: 'array',
                  labelAr: 'المدينة',
                  labelEn: 'City',
                },
                {
                  key: 'age',
                  type: 'number',
                  labelAr: 'العمر',
                  labelEn: 'Age',
                },
                {
                  key: 'numberOfRooms',
                  type: 'number',
                  labelAr: 'عدد الغرف',
                  labelEn: 'Number Of Rooms',
                },
                {
                  key: 'totalArea',
                  type: 'number',
                  labelAr: 'المساحة الكلية',
                  labelEn: 'Total Area',
                },
                {
                  key: 'numberOfFloors',
                  type: 'number',
                  labelAr: 'عدد الطوابق',
                  labelEn: 'Number Of Floors',
                },
              ],
            },
          },
          {
            nameAr: 'وحدة',
            nameEn: 'Unit',
            customFields: {
              create: [
                {
                  key: 'countryId',
                  type: 'array',
                  labelAr: 'الدولة',
                  labelEn: 'Country',
                },
                {
                  key: 'cityId',
                  type: 'array',
                  labelAr: 'المدينة',
                  labelEn: 'City',
                },
                {
                  key: 'age',
                  type: 'number',
                  labelAr: 'العمر',
                  labelEn: 'Age',
                },
                {
                  key: 'numberOfRooms',
                  type: 'number',
                  labelAr: 'عدد الغرف',
                  labelEn: 'Number Of Rooms',
                },
                {
                  key: 'totalArea',
                  type: 'number',
                  labelAr: 'المساحة الكلية',
                  labelEn: 'Total Area',
                },
              ],
            },
          },
          {
            nameAr: 'فيلا',
            nameEn: 'Villa',
            customFields: {
              create: [
                {
                  key: 'countryId',
                  type: 'array',
                  labelAr: 'الدولة',
                  labelEn: 'Country',
                },
                {
                  key: 'cityId',
                  type: 'array',
                  labelAr: 'المدينة',
                  labelEn: 'City',
                },
                {
                  key: 'age',
                  type: 'number',
                  labelAr: 'العمر',
                  labelEn: 'Age',
                },
                {
                  key: 'numberOfRooms',
                  type: 'number',
                  labelAr: 'عدد الغرف',
                  labelEn: 'Number Of Rooms',
                },
                {
                  key: 'totalArea',
                  type: 'number',
                  labelAr: 'المساحة الكلية',
                  labelEn: 'Total Area',
                },
                {
                  key: 'numberOfFloors',
                  type: 'number',
                  labelAr: 'عدد الطوابق',
                  labelEn: 'Number Of Floors',
                },
              ],
            },
          },
          {
            nameAr: 'أرض',
            nameEn: 'Land',
            customFields: {
              create: [
                {
                  key: 'countryId',
                  type: 'array',
                  labelAr: 'الدولة',
                  labelEn: 'Country',
                },
                {
                  key: 'cityId',
                  type: 'array',
                  labelAr: 'المدينة',
                  labelEn: 'City',
                },
                {
                  key: 'landType',
                  type: 'array',
                  labelAr: 'نوع الأرض',
                  labelEn: 'Land Type',
                },
                {
                  key: 'totalArea',
                  type: 'number',
                  labelAr: 'المساحة الكلية',
                  labelEn: 'Total Area',
                },
              ],
            },
          },
          {
            nameAr: 'مكتب',
            nameEn: 'Office',
            customFields: {
              create: [
                {
                  key: 'countryId',
                  type: 'array',
                  labelAr: 'الدولة',
                  labelEn: 'Country',
                },
                {
                  key: 'cityId',
                  type: 'array',
                  labelAr: 'المدينة',
                  labelEn: 'City',
                },
                {
                  key: 'age',
                  type: 'number',
                  labelAr: 'العمر',
                  labelEn: 'Age',
                },
                {
                  key: 'numberOfRooms',
                  type: 'number',
                  labelAr: 'عدد الغرف',
                  labelEn: 'Number Of Rooms',
                },
                {
                  key: 'totalArea',
                  type: 'number',
                  labelAr: 'المساحة الكلية',
                  labelEn: 'Total Area',
                },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.category.create({
    data: {
      nameAr: 'سيارات',
      nameEn: 'Cars',
      hasUsageCondition: true,
      customFields: {
        create: [
          {
            key: 'color',
            type: 'array',
            labelAr: 'اللون',
            labelEn: 'Color',
          },
          {
            key: 'carType',
            type: 'array',
            labelAr: 'نوع العربية',
            labelEn: 'Car Type',
          },
        ],
      },
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
