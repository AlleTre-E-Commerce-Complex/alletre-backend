import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import * as bcrypt from 'bcrypt';

async function main() {
  const hashedPassword = await bcrypt.hash(
    process.env.ADMIN_PASS,
    parseInt(process.env.SALT),
  );

  await prisma.admin.create({
    data: { email: process.env.ADMIN_EMAIL, password: hashedPassword },
  });
  await prisma.category.create({
    data: {
      nameAr: 'الأجهزة الكهربائية',
      nameEn: 'Electronic Devices',
      hasUsageCondition: true,
      bidderDepositFixedAmount: 100,
      sellerDepositFixedAmount: 100,
      brands: {
        create: [
          { name: 'Sony' },
          { name: 'Toshiba' },
          { name: 'Panasonic' },
          { name: 'Samsung' },
          { name: 'LG' },
          { name: 'Microsoft' },
          { name: 'Apple' },
          { name: 'Intel' },
          { name: 'Acer' },
          { name: 'Alcatel' },
          { name: 'Amazon' },
          { name: 'Asus' },
          { name: 'Cannon' },
        ],
      },
      subCategories: {
        create: [
          {
            nameAr: 'أجهزة الكمبيوتر والأجهزة اللوحية',
            nameEn: 'Computers & tablets',
            customFields: {
              create: [
                {
                  key: 'screenSize',
                  resKey: 'screenSize',
                  type: 'number',
                  labelAr: 'حجم الشاشة',
                  labelEn: 'Screen Size',
                },
                {
                  key: 'operatingSystem',
                  resKey: 'operatingSystem',
                  type: 'text',
                  labelAr: 'نظام التشغيل',
                  labelEn: 'Operatin System',
                },
                {
                  key: 'releaseYear',
                  resKey: 'releaseYear',
                  type: 'text',
                  labelAr: 'سنة الاصدار',
                  labelEn: 'Release Year',
                },
                {
                  key: 'color',
                  resKey: 'color',
                  type: 'array',
                  labelAr: 'اللون',
                  labelEn: 'Color',
                },
                {
                  key: 'regionOfManufacture',
                  resKey: 'regionOfManufacture',
                  type: 'text',
                  labelAr: 'منظقة المنشأ',
                  labelEn: 'Region Of Manufacture',
                },
                {
                  key: 'ramSize',
                  resKey: 'ramSize',
                  type: 'number',
                  labelAr: 'حجم الرامات',
                  labelEn: 'Ram Size',
                },
                {
                  key: 'processor',
                  resKey: 'processor',
                  type: 'text',
                  labelAr: 'بروسيسور',
                  labelEn: 'Processor',
                },
                {
                  key: 'brandId',
                  resKey: 'brand',
                  type: 'array',
                  labelAr: 'ماركة',
                  labelEn: 'Brand',
                },
                {
                  key: 'model',
                  resKey: 'model',
                  type: 'text',
                  labelAr: 'موديل',
                  labelEn: 'Model',
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
                  resKey: 'releaseYear',
                  type: 'text',
                  labelAr: 'سنة الاصدار',
                  labelEn: 'Release Year',
                },
                {
                  key: 'color',
                  resKey: 'color',
                  type: 'array',
                  labelAr: 'اللون',
                  labelEn: 'Color',
                },
                {
                  key: 'regionOfManufacture',
                  resKey: 'regionOfManufacture',
                  type: 'text',
                  labelAr: 'منظقة المنشأ',
                  labelEn: 'Region Of Manufacture',
                },
                {
                  key: 'cameraType',
                  resKey: 'cameraType',
                  type: 'array',
                  labelAr: 'نوع الكاميرا',
                  labelEn: 'Camera Type',
                },
                {
                  key: 'brandId',
                  resKey: 'brand',
                  type: 'array',
                  labelAr: 'ماركة',
                  labelEn: 'Brand',
                },
                {
                  key: 'model',
                  resKey: 'model',
                  type: 'text',
                  labelAr: 'موديل',
                  labelEn: 'Model',
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
                  resKey: 'screenSize',
                  type: 'number',
                  labelAr: 'حجم الشاشة',
                  labelEn: 'Screen Size',
                },
                {
                  key: 'releaseYear',
                  resKey: 'releaseYear',
                  type: 'text',
                  labelAr: 'سنة الاصدار',
                  labelEn: 'Release Year',
                },
                {
                  key: 'color',
                  resKey: 'color',
                  type: 'array',
                  labelAr: 'اللون',
                  labelEn: 'Color',
                },
                {
                  key: 'regionOfManufacture',
                  resKey: 'regionOfManufacture',
                  type: 'text',
                  labelAr: 'منظقة المنشأ',
                  labelEn: 'Region Of Manufacture',
                },
                {
                  key: 'brandId',
                  resKey: 'brand',
                  type: 'array',
                  labelAr: 'ماركة',
                  labelEn: 'Brand',
                },
                {
                  key: 'model',
                  resKey: 'model',
                  type: 'text',
                  labelAr: 'موديل',
                  labelEn: 'Model',
                },
              ],
            },
          },
          {
            nameAr: 'الهواتف المحمولة ',
            nameEn: 'Smart Phones',
            customFields: {
              create: [
                {
                  key: 'screenSize',
                  resKey: 'screenSize',
                  type: 'number',
                  labelAr: 'حجم الشاشة',
                  labelEn: 'Screen Size',
                },
                {
                  key: 'operatingSystem',
                  resKey: 'operatingSystem',
                  type: 'text',
                  labelAr: 'نظام التشغيل',
                  labelEn: 'Operatin System',
                },
                {
                  key: 'releaseYear',
                  resKey: 'releaseYear',
                  type: 'text',
                  labelAr: 'سنة الاصدار',
                  labelEn: 'Release Year',
                },
                {
                  key: 'color',
                  resKey: 'color',
                  type: 'array',
                  labelAr: 'اللون',
                  labelEn: 'Color',
                },
                {
                  key: 'regionOfManufacture',
                  resKey: 'regionOfManufacture',
                  type: 'text',
                  labelAr: 'منظقة المنشأ',
                  labelEn: 'Region Of Manufacture',
                },
                {
                  key: 'memory',
                  resKey: 'memory',
                  type: 'array',
                  labelAr: 'ذكرى',
                  labelEn: 'Memory',
                },
                {
                  key: 'brandId',
                  resKey: 'brand',
                  type: 'array',
                  labelAr: 'ماركة',
                  labelEn: 'Brand',
                },
                {
                  key: 'model',
                  resKey: 'model',
                  type: 'text',
                  labelAr: 'موديل',
                  labelEn: 'Model',
                },
              ],
            },
          },
          {
            nameAr: 'الإكسسوارات',
            nameEn: 'Accessories',
            customFields: {
              create: [
                {
                  key: 'color',
                  resKey: 'color',
                  type: 'array',
                  labelAr: 'اللون',
                  labelEn: 'Color',
                },
                {
                  key: 'type',
                  resKey: 'type',
                  type: 'text',
                  labelAr: 'النوع',
                  labelEn: 'Type',
                },
                {
                  key: 'material',
                  resKey: 'material',
                  type: 'array',
                  labelAr: 'نوع المادة',
                  labelEn: 'Material',
                },
                {
                  key: 'brandId',
                  resKey: 'brand',
                  type: 'array',
                  labelAr: 'ماركة',
                  labelEn: 'Brand',
                },
                {
                  key: 'model',
                  resKey: 'model',
                  type: 'text',
                  labelAr: 'موديل',
                  labelEn: 'Model',
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
      bidderDepositFixedAmount: 100,
      sellerDepositFixedAmount: 100,
      brands: {
        create: [
          { name: 'Mejuri' },
          { name: 'Khiry' },
          { name: 'Almasika' },
          { name: 'Bea Bongiasca' },
          { name: 'Swarovski' },
          { name: 'Sophie Bille Brahe' },
          { name: 'Selim Mouzannar' },
          { name: 'Sophia Beirut' },
          { name: 'Noor Fares' },
        ],
      },
      subCategories: {
        create: [
          {
            nameAr: 'ذهب',
            nameEn: 'Gold',
            customFields: {
              create: [
                {
                  key: 'brandId',
                  resKey: 'brand',
                  type: 'array',
                  labelAr: 'ماركة',
                  labelEn: 'Brand',
                },
                {
                  key: 'model',
                  resKey: 'model',
                  type: 'text',
                  labelAr: 'موديل',
                  labelEn: 'Model',
                },
              ],
            },
          },
          {
            nameAr: 'الماس',
            nameEn: 'Diamond',
            customFields: {
              create: [
                {
                  key: 'brandId',
                  resKey: 'brand',
                  type: 'array',
                  labelAr: 'ماركة',
                  labelEn: 'Brand',
                },
                {
                  key: 'model',
                  resKey: 'model',
                  type: 'text',
                  labelAr: 'موديل',
                  labelEn: 'Model',
                },
              ],
            },
          },
          {
            nameAr: 'فضة',
            nameEn: 'Silver',
            customFields: {
              create: [
                {
                  key: 'brandId',
                  resKey: 'brand',
                  type: 'array',
                  labelAr: 'ماركة',
                  labelEn: 'Brand',
                },
                {
                  key: 'model',
                  resKey: 'model',
                  type: 'text',
                  labelAr: 'موديل',
                  labelEn: 'Model',
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
      nameAr: 'ملكيات',
      nameEn: 'Properties',
      bidderDepositFixedAmount: 100,
      sellerDepositFixedAmount: 100,
      subCategories: {
        create: [
          {
            nameAr: 'منزل',
            nameEn: 'House',
            customFields: {
              create: [
                {
                  key: 'countryId',
                  resKey: 'country',
                  type: 'array',
                  labelAr: 'الدولة',
                  labelEn: 'Country',
                },
                {
                  key: 'cityId',
                  resKey: 'city',
                  type: 'array',
                  labelAr: 'المدينة',
                  labelEn: 'City',
                },
                {
                  key: 'age',
                  resKey: 'age',
                  type: 'number',
                  labelAr: 'العمر',
                  labelEn: 'Age',
                },
                {
                  key: 'numberOfRooms',
                  resKey: 'numberOfRooms',
                  type: 'number',
                  labelAr: 'عدد الغرف',
                  labelEn: 'Number Of Rooms',
                },
                {
                  key: 'totalArea',
                  resKey: 'totalArea',
                  type: 'number',
                  labelAr: 'المساحة الكلية',
                  labelEn: 'Total Area',
                },
                {
                  key: 'numberOfFloors',
                  resKey: 'numberOfFloors',
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
                  resKey: 'country',
                  type: 'array',
                  labelAr: 'الدولة',
                  labelEn: 'Country',
                },
                {
                  key: 'cityId',
                  resKey: 'city',
                  type: 'array',
                  labelAr: 'المدينة',
                  labelEn: 'City',
                },
                {
                  key: 'age',
                  resKey: 'age',
                  type: 'number',
                  labelAr: 'العمر',
                  labelEn: 'Age',
                },
                {
                  key: 'numberOfRooms',
                  resKey: 'numberOfRooms',
                  type: 'number',
                  labelAr: 'عدد الغرف',
                  labelEn: 'Number Of Rooms',
                },
                {
                  key: 'totalArea',
                  resKey: 'totalArea',
                  type: 'number',
                  labelAr: 'المساحة الكلية',
                  labelEn: 'Total Area',
                },
                {
                  key: 'numberOfFloors',
                  resKey: 'numberOfFloors',
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
                  resKey: 'country',
                  type: 'array',
                  labelAr: 'الدولة',
                  labelEn: 'Country',
                },
                {
                  key: 'cityId',
                  resKey: 'city',
                  type: 'array',
                  labelAr: 'المدينة',
                  labelEn: 'City',
                },
                {
                  key: 'age',
                  resKey: 'age',
                  type: 'number',
                  labelAr: 'العمر',
                  labelEn: 'Age',
                },
                {
                  key: 'numberOfRooms',
                  resKey: 'numberOfRooms',
                  type: 'number',
                  labelAr: 'عدد الغرف',
                  labelEn: 'Number Of Rooms',
                },
                {
                  key: 'totalArea',
                  resKey: 'totalArea',
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
                  resKey: 'country',
                  type: 'array',
                  labelAr: 'الدولة',
                  labelEn: 'Country',
                },
                {
                  key: 'cityId',
                  resKey: 'city',
                  type: 'array',
                  labelAr: 'المدينة',
                  labelEn: 'City',
                },
                {
                  key: 'age',
                  resKey: 'age',
                  type: 'number',
                  labelAr: 'العمر',
                  labelEn: 'Age',
                },
                {
                  key: 'numberOfRooms',
                  resKey: 'numberOfRooms',
                  type: 'number',
                  labelAr: 'عدد الغرف',
                  labelEn: 'Number Of Rooms',
                },
                {
                  key: 'totalArea',
                  resKey: 'totalArea',
                  type: 'number',
                  labelAr: 'المساحة الكلية',
                  labelEn: 'Total Area',
                },
                {
                  key: 'numberOfFloors',
                  resKey: 'numberOfFloors',
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
                  resKey: 'country',
                  type: 'array',
                  labelAr: 'الدولة',
                  labelEn: 'Country',
                },
                {
                  key: 'cityId',
                  resKey: 'city',
                  type: 'array',
                  labelAr: 'المدينة',
                  labelEn: 'City',
                },
                {
                  key: 'landType',
                  resKey: 'landType',
                  type: 'array',
                  labelAr: 'نوع الأرض',
                  labelEn: 'Land Type',
                },
                {
                  key: 'totalArea',
                  resKey: 'totalArea',
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
                  resKey: 'country',
                  type: 'array',
                  labelAr: 'الدولة',
                  labelEn: 'Country',
                },
                {
                  key: 'cityId',
                  resKey: 'city',
                  type: 'array',
                  labelAr: 'المدينة',
                  labelEn: 'City',
                },
                {
                  key: 'age',
                  resKey: 'age',
                  type: 'number',
                  labelAr: 'العمر',
                  labelEn: 'Age',
                },
                {
                  key: 'numberOfRooms',
                  resKey: 'numberOfRooms',
                  type: 'number',
                  labelAr: 'عدد الغرف',
                  labelEn: 'Number Of Rooms',
                },
                {
                  key: 'totalArea',
                  resKey: 'totalArea',
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
      bidderDepositFixedAmount: 100,
      sellerDepositFixedAmount: 100,
      brands: {
        create: [
          { name: 'Alfa Romeo' },
          { name: 'Audi' },
          { name: 'BMW' },
          { name: 'Bentley' },
          { name: 'Cadillac' },
          { name: 'Chevrolet' },
          { name: 'Chrysler' },
          { name: 'Fiat' },
          { name: 'Hyundai' },
        ],
      },
      customFields: {
        create: [
          {
            key: 'color',
            resKey: 'color',
            type: 'array',
            labelAr: 'اللون',
            labelEn: 'Color',
          },
          {
            key: 'carType',
            resKey: 'carType',
            type: 'array',
            labelAr: 'نوع العربية',
            labelEn: 'Car Type',
          },
          {
            key: 'brandId',
            resKey: 'brand',
            type: 'array',
            labelAr: 'ماركة',
            labelEn: 'Brand',
          },
          {
            key: 'model',
            resKey: 'model',
            type: 'text',
            labelAr: 'موديل',
            labelEn: 'Model',
          },
        ],
      },
    },
  });

  // // Inject Country with Cities
  // await prisma.country.create({
  //   data: {
  //     nameAr: 'مصر',
  //     nameEn: 'Egypt',
  //     currency: 'EGP',
  //     cities: {
  //       create: [
  //         { nameAr: 'القاهرة', nameEn: 'Cairo' },
  //         { nameAr: 'الاسكندرية', nameEn: 'Alexandria' },
  //         { nameAr: 'الجيزة', nameEn: 'Giza' },
  //         { nameAr: 'القليوبية', nameEn: 'Qalyubia' },
  //         { nameAr: 'بور سعيد', nameEn: 'Port Said' },
  //         { nameAr: 'السويس', nameEn: 'Suez' },
  //         { nameAr: 'الغربية', nameEn: 'Gharbia' },
  //         { nameAr: 'الاقصر', nameEn: 'Luxor' },
  //         { nameAr: 'الدقهلية', nameEn: 'Dakahlia' },
  //         { nameAr: 'اسيوط', nameEn: 'Asyut	' },
  //         { nameAr: 'الاسماعيلية', nameEn: 'Ismailia' },
  //         { nameAr: 'الفيوم', nameEn: 'Faiyum' },
  //         { nameAr: 'الشرقية', nameEn: 'Sharqia' },
  //         { nameAr: 'دمياط', nameEn: 'Damietta' },
  //         { nameAr: 'اسوان', nameEn: 'Aswan' },
  //         { nameAr: 'المنيا', nameEn: 'Minya' },
  //         { nameAr: 'البحيرة', nameEn: 'Beheira' },
  //         { nameAr: 'بنى سويف', nameEn: 'Beni Suef' },
  //         { nameAr: 'الغردقة', nameEn: 'Red Sea' },
  //         { nameAr: 'شرم الشيخ', nameEn: 'Sharm El-Sheikh' },
  //         { nameAr: 'كفر الشيخ ', nameEn: 'Kafr El-Sheikh' },
  //         { nameAr: 'قنا', nameEn: 'Qena' },
  //         { nameAr: 'سوهاج', nameEn: 'Sohag' },
  //         { nameAr: 'المنوفية', nameEn: 'Monufia' },
  //         { nameAr: 'شمال سيناء', nameEn: 'North Sinai' },
  //         { nameAr: 'جنوب سيناء', nameEn: 'South Sinai' },
  //       ],
  //     },
  //   },
  // });

  await prisma.country.create({
    data: {
      nameAr: 'الإمارات العربية المتحدة',
      nameEn: 'United Arab Emirates',
      currency: 'AED',
      cities: {
        create: [
          { nameAr: 'دبي', nameEn: 'Dubai' },
          { nameAr: 'ابوظبي', nameEn: 'Abu Dhabi' },
          { nameAr: 'الشارقة', nameEn: 'Sharjah' },
          { nameAr: 'عجمان', nameEn: 'Ajman' },
          { nameAr: 'رأس الخيمة', nameEn: 'Ras Al Khaimah' },
          { nameAr: 'الفجيرة', nameEn: 'Fujairah' },
          { nameAr: ' أم القيوين', nameEn: 'Umm Al-Quwain' },
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
