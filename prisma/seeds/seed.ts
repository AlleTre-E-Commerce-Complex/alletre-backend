import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import * as bcrypt from 'bcrypt';

async function main() {
  const hashedPassword = await bcrypt.hash(
    process.env.ADMIN_PASS || 'admin123',
    parseInt(process.env.SALT || '10'),
  );

  // Seed Admin if not exists
  const adminExists = await prisma.admin.findFirst({
    where: { email: process.env.ADMIN_EMAIL },
  });
  if (!adminExists) {
    await prisma.admin.create({
      data: { email: process.env.ADMIN_EMAIL, password: hashedPassword },
    });
  }

  // Helper for Categories
  const seedCategory = async (nameEn: string, data: any) => {
    const exists = await prisma.category.findFirst({ where: { nameEn } });
    if (!exists) {
      return await prisma.category.create({ data });
    }
    return exists;
  };

  // 1. Electronic Devices
  await seedCategory('Electronic Devices', {
    nameAr: 'الأجهزة الإلكترونية',
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
        { name: 'Canon' },
        { name: 'Huawei' },
        { name: 'Xiaomi' },
        { name: 'OnePlus' },
        { name: 'Realme' },
        { name: 'Oppo' },
        { name: 'Vivo' },
        { name: 'Nokia' },
        { name: 'Google' },
        { name: 'Lenovo' },
        { name: 'HP' },
        { name: 'Dell' },
        { name: 'Razer' },
        { name: 'HTC' },
        { name: 'BlackBerry' },
        { name: 'ZTE' },
        { name: 'Philips' },
        { name: 'JBL' },
        { name: 'Beats by Dre' },
        { name: 'Bose' },
        { name: 'Logitech' },
        { name: 'Anker' },
        { name: 'Bang & Olufsen' },
        { name: 'Epson' },
        { name: 'Brother' },
        { name: 'Sharp' },
        { name: 'Fujitsu' },
        { name: 'ViewSonic' },
        { name: 'Hisense' },
        { name: 'TCL' },
        { name: 'Dyson' },
        { name: 'Garmin' },
        { name: 'GoPro' },
        { name: 'Fitbit' },
        { name: 'Pebble' },
      ],
    },
    subCategories: {
      create: [
        {
          nameAr: 'الأجهزة المنزلية',
          nameEn: 'Home Appliances',
          customFields: {
            create: [
              {
                key: 'age',
                resKey: 'age',
                type: 'number',
                labelAr: 'عمر الاستخدام',
                labelEn: 'AGE',
              },
              {
                key: 'model',
                resKey: 'model',
                type: 'text',
                labelAr: 'موديل',
                labelEn: 'MODEL',
              },
            ],
          },
        },
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
                labelEn: 'SCREEN SIZE',
              },
              {
                key: 'operatingSystem',
                resKey: 'operatingSystem',
                type: 'text',
                labelAr: 'نظام التشغيل',
                labelEn: 'OPERATING SYSTEM',
              },
              {
                key: 'releaseYear',
                resKey: 'releaseYear',
                type: 'number',
                labelAr: 'سنة الاصدار',
                labelEn: 'RELEASE YEAR',
              },
              {
                key: 'color',
                resKey: 'color',
                type: 'array',
                labelAr: 'اللون',
                labelEn: 'COLOR',
              },
              {
                key: 'regionOfManufacture',
                resKey: 'regionOfManufacture',
                type: 'text',
                labelAr: 'بلد المنشأ',
                labelEn: 'REGION OF MANUFACTURE',
              },
              {
                key: 'ramSize',
                resKey: 'ramSize',
                type: 'number',
                labelAr: 'حجم الرامات',
                labelEn: 'RAM SIZE',
              },
              {
                key: 'processor',
                resKey: 'processor',
                type: 'text',
                labelAr: 'بروسيسور',
                labelEn: 'PROCESSOR',
              },
              {
                key: 'brandId',
                resKey: 'brand',
                type: 'text',
                labelAr: 'ماركة',
                labelEn: 'BRAND',
              },
              {
                key: 'model',
                resKey: 'model',
                type: 'text',
                labelAr: 'موديل',
                labelEn: 'MODEL',
              },
              {
                key: 'graphicCard',
                resKey: 'graphicCard',
                type: 'text',
                labelAr: 'معالج الرسومات',
                labelEn: 'GRAPHIC CARD',
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
                type: 'number',
                labelAr: 'سنة الاصدار',
                labelEn: 'RELEASE YEAR',
              },
              {
                key: 'color',
                resKey: 'color',
                type: 'array',
                labelAr: 'اللون',
                labelEn: 'COLOR',
              },
              {
                key: 'regionOfManufacture',
                resKey: 'regionOfManufacture',
                type: 'text',
                labelAr: 'بلد المنشأ',
                labelEn: 'REGION OF MANUFACTURE',
              },
              {
                key: 'cameraType',
                resKey: 'cameraType',
                type: 'array',
                labelAr: 'نوع الكاميرا',
                labelEn: 'CAMERA TYPE',
              },
              {
                key: 'brandId',
                resKey: 'brand',
                type: 'text',
                labelAr: 'ماركة',
                labelEn: 'BRAND',
              },
              {
                key: 'model',
                resKey: 'model',
                type: 'text',
                labelAr: 'موديل',
                labelEn: 'MODEL',
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
                labelEn: 'SCREEN SIZE',
              },
              {
                key: 'releaseYear',
                resKey: 'releaseYear',
                type: 'number',
                labelAr: 'سنة الاصدار',
                labelEn: 'RELEASE YEAR',
              },
              {
                key: 'color',
                resKey: 'color',
                type: 'array',
                labelAr: 'اللون',
                labelEn: 'COLOR',
              },
              {
                key: 'regionOfManufacture',
                resKey: 'regionOfManufacture',
                type: 'text',
                labelAr: 'بلد المنشأ',
                labelEn: 'REGION OF MANUFACTURE',
              },
              {
                key: 'brandId',
                resKey: 'brand',
                type: 'text',
                labelAr: 'ماركة',
                labelEn: 'BRAND',
              },
              {
                key: 'model',
                resKey: 'model',
                type: 'text',
                labelAr: 'موديل',
                labelEn: 'MODEL',
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
                labelEn: 'SCREEN SIZE',
              },
              {
                key: 'operatingSystem',
                resKey: 'operatingSystem',
                type: 'text',
                labelAr: 'نظام التشغيل',
                labelEn: 'OPERATING SYSTEM',
              },
              {
                key: 'releaseYear',
                resKey: 'releaseYear',
                type: 'number',
                labelAr: 'سنة الاصدار',
                labelEn: 'RELEASE YEAR',
              },
              {
                key: 'color',
                resKey: 'color',
                type: 'array',
                labelAr: 'اللون',
                labelEn: 'COLOR',
              },
              {
                key: 'regionOfManufacture',
                resKey: 'regionOfManufacture',
                type: 'text',
                labelAr: 'بلد المنشأ',
                labelEn: 'REGION OF MANUFACTURE',
              },
              {
                key: 'memory',
                resKey: 'memory',
                type: 'array',
                labelAr: 'سعة التخزين',
                labelEn: 'MEMORY',
              },
              {
                key: 'brandId',
                resKey: 'brand',
                type: 'text',
                labelAr: 'ماركة',
                labelEn: 'BRAND',
              },
              {
                key: 'model',
                resKey: 'model',
                type: 'text',
                labelAr: 'موديل',
                labelEn: 'MODEL',
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
                labelEn: 'COLOR',
              },
              {
                key: 'type',
                resKey: 'type',
                type: 'text',
                labelAr: 'النوع',
                labelEn: 'TYPE',
              },
              {
                key: 'material',
                resKey: 'material',
                type: 'array',
                labelAr: 'نوع المادة',
                labelEn: 'MATERIAL',
              },
              {
                key: 'brandId',
                resKey: 'brand',
                type: 'text',
                labelAr: 'ماركة',
                labelEn: 'BRAND',
              },
              {
                key: 'model',
                resKey: 'model',
                type: 'text',
                labelAr: 'موديل',
                labelEn: 'MODEL',
              },
            ],
          },
        },
      ],
    },
  });

  // 2. Jewellers
  await seedCategory('Jewellers', {
    nameAr: 'مجوهرات',
    nameEn: 'Jewellers',
    hasUsageCondition: true,
    bidderDepositFixedAmount: 300,
    sellerDepositFixedAmount: 300,
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
        { name: 'Damas' },
        { name: 'Tiffany & Co.' },
        { name: 'Chopard' },
        { name: 'Cartier' },
        { name: 'Van Cleef & Arpels' },
        { name: 'Bvlgari' },
        { name: 'Piaget' },
        { name: 'Graff' },
        { name: 'Harry Winston' },
        { name: 'Mouawad' },
        { name: 'Chaumet' },
        { name: 'Messika' },
        { name: 'De Beers' },
        { name: 'Roberto Coin' },
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
                type: 'text',
                labelAr: 'ماركة',
                labelEn: 'BRAND',
              },
              {
                key: 'model',
                resKey: 'model',
                type: 'text',
                labelAr: 'موديل',
                labelEn: 'MODEL',
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
                type: 'text',
                labelAr: 'ماركة',
                labelEn: 'BRAND',
              },
              {
                key: 'model',
                resKey: 'model',
                type: 'text',
                labelAr: 'موديل',
                labelEn: 'MODEL',
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
                type: 'text',
                labelAr: 'ماركة',
                labelEn: 'BRAND',
              },
              {
                key: 'model',
                resKey: 'model',
                type: 'text',
                labelAr: 'موديل',
                labelEn: 'MODEL',
              },
            ],
          },
        },
      ],
    },
  });

  // 3. Properties
  await seedCategory('Properties', {
    nameAr: 'عقارات',
    nameEn: 'Properties',
    bidderDepositFixedAmount: 5000,
    sellerDepositFixedAmount: 5000,
    subCategories: {
      create: [
        {
          nameAr: 'سكني',
          nameEn: 'Residential',
          customFields: {
            create: [
              {
                key: 'residentialType',
                resKey: 'residentialType',
                type: 'array',
                labelAr: 'نوع العقار السكني',
                labelEn: 'RESIDENTIAL TYPE',
              },
              {
                key: 'age',
                resKey: 'age',
                type: 'number',
                labelAr: 'العمر',
                labelEn: 'AGE',
              },
              {
                key: 'numberOfRooms',
                resKey: 'numberOfRooms',
                type: 'number',
                labelAr: 'عدد الغرف',
                labelEn: 'NUMBER OF ROOMS',
              },
              {
                key: 'totalArea',
                resKey: 'totalArea',
                type: 'number',
                labelAr: '(قدم مربع) المساحة الكلية',
                labelEn: 'TOTAL AREA (SQ FT)',
              },
              {
                key: 'numberOfFloors',
                resKey: 'numberOfFloors',
                type: 'number',
                labelAr: 'عدد الطوابق',
                labelEn: 'NUMBER OF FLOORS',
              },
              {
                key: 'totalClosingFee',
                resKey: 'totalClosingFee',
                type: 'number',
                labelAr: 'إجمالي رسوم الإغلاق',
                labelEn: 'TOTAL CLOSING FEE',
              },
              {
                key: 'numberOfBathrooms',
                resKey: 'numberOfBathrooms',
                type: 'number',
                labelAr: 'الحمامات',
                labelEn: 'BATHROOMS',
              },
              {
                key: 'developer',
                resKey: 'developer',
                type: 'string',
                labelAr: 'المطور',
                labelEn: 'DEVELOPER',
              },
              {
                key: 'readyBy',
                resKey: 'readyBy',
                type: 'string',
                labelAr: 'جاهز بحلول',
                labelEn: 'READY BY',
              },
              {
                key: 'annualCommunityFee',
                resKey: 'annualCommunityFee',
                type: 'number',
                labelAr: 'رسوم المجتمع السنوية',
                labelEn: 'ANNUAL COMMUNITY FEE',
              },
              {
                key: 'isFurnished',
                resKey: 'isFurnished',
                type: 'string',
                labelAr: 'هل مفروشة؟',
                labelEn: 'IS IT FURNISHED?',
              },
              {
                key: 'propertyReferenceId',
                resKey: 'propertyReferenceId',
                type: 'string',
                labelAr: 'رقم المرجع للعقار',
                labelEn: 'PROPERTY REFERENCE ID #',
              },
              {
                key: 'buyerTransferFee',
                resKey: 'buyerTransferFee',
                type: 'number',
                labelAr: 'رسوم تحويل المشتري',
                labelEn: 'BUYER TRANSFER FEE',
              },
              {
                key: 'sellerTransferFee',
                resKey: 'sellerTransferFee',
                type: 'number',
                labelAr: 'رسوم تحويل البائع',
                labelEn: 'SELLER TRANSFER FEE',
              },
              {
                key: 'maintenanceFee',
                resKey: 'maintenanceFee',
                type: 'number',
                labelAr: 'رسوم الصيانة',
                labelEn: 'MAINTENANCE FEE',
              },
              {
                key: 'occupancyStatus',
                resKey: 'occupancyStatus',
                type: 'string',
                labelAr: 'حالة الإشغال',
                labelEn: 'OCCUPANCY STATUS',
              },
              {
                key: 'amenities',
                resKey: 'amenities',
                type: 'array',
                labelAr: 'وسائل الراحة',
                labelEn: 'AMENITIES',
              },
            ],
          },
        },
        {
          nameAr: 'تجاري',
          nameEn: 'Commercial',
          customFields: {
            create: [
              {
                key: 'commercialType',
                resKey: 'commercialType',
                type: 'array',
                labelAr: 'نوع العقار التجاري',
                labelEn: 'COMMERCIAL TYPE',
              },
              {
                key: 'age',
                resKey: 'age',
                type: 'number',
                labelAr: 'العمر',
                labelEn: 'AGE',
              },
              {
                key: 'numberOfRooms',
                resKey: 'numberOfRooms',
                type: 'number',
                labelAr: 'عدد الغرف',
                labelEn: 'NUMBER OF ROOMS',
              },
              {
                key: 'totalArea',
                resKey: 'totalArea',
                type: 'number',
                labelAr: '(قدم مربع) المساحة الكلية',
                labelEn: 'TOTAL AREA (SQ FT)',
              },
              {
                key: 'numberOfFloors',
                resKey: 'numberOfFloors',
                type: 'number',
                labelAr: 'عدد الطوابق',
                labelEn: 'NUMBER OF FLOORS',
              },
              {
                key: 'totalClosingFee',
                resKey: 'totalClosingFee',
                type: 'number',
                labelAr: 'إجمالي رسوم الإغلاق',
                labelEn: 'TOTAL CLOSING FEE',
              },
              {
                key: 'developer',
                resKey: 'developer',
                type: 'string',
                labelAr: 'المطور',
                labelEn: 'DEVELOPER',
              },
              {
                key: 'readyBy',
                resKey: 'readyBy',
                type: 'string',
                labelAr: 'جاهز بحلول',
                labelEn: 'READY BY',
              },
              {
                key: 'annualCommunityFee',
                resKey: 'annualCommunityFee',
                type: 'number',
                labelAr: 'رسوم المجتمع السنوية',
                labelEn: 'ANNUAL COMMUNITY FEE',
              },
              {
                key: 'isFurnished',
                resKey: 'isFurnished',
                type: 'string',
                labelAr: 'هل مفروشة؟',
                labelEn: 'IS IT FURNISHED?',
              },
              {
                key: 'propertyReferenceId',
                resKey: 'propertyReferenceId',
                type: 'string',
                labelAr: 'رقم المرجع للعقار',
                labelEn: 'PROPERTY REFERENCE ID #',
              },
              {
                key: 'buyerTransferFee',
                resKey: 'buyerTransferFee',
                type: 'number',
                labelAr: 'رسوم تحويل المشتري',
                labelEn: 'BUYER TRANSFER FEE',
              },
              {
                key: 'sellerTransferFee',
                resKey: 'sellerTransferFee',
                type: 'number',
                labelAr: 'رسوم تحويل البائع',
                labelEn: 'SELLER TRANSFER FEE',
              },
              {
                key: 'maintenanceFee',
                resKey: 'maintenanceFee',
                type: 'number',
                labelAr: 'رسوم الصيانة',
                labelEn: 'MAINTENANCE FEE',
              },
              {
                key: 'occupancyStatus',
                resKey: 'occupancyStatus',
                type: 'string',
                labelAr: 'حالة الإشغال',
                labelEn: 'OCCUPANCY STATUS',
              },
              {
                key: 'amenities',
                resKey: 'amenities',
                type: 'array',
                labelAr: 'وسائل الراحة',
                labelEn: 'AMENITIES',
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
                key: 'totalArea',
                resKey: 'totalArea',
                type: 'number',
                labelAr: '(قدم مربع) المساحة الكلية',
                labelEn: 'TOTAL AREA (SQ FT)',
              },
              {
                key: 'totalClosingFee',
                resKey: 'totalClosingFee',
                type: 'number',
                labelAr: 'إجمالي رسوم الإغلاق',
                labelEn: 'TOTAL CLOSING FEE',
              },
              {
                key: 'propertyReferenceId',
                resKey: 'propertyReferenceId',
                type: 'string',
                labelAr: 'رقم المرجع للعقار',
                labelEn: 'PROPERTY REFERENCE ID #',
              },
              {
                key: 'buyerTransferFee',
                resKey: 'buyerTransferFee',
                type: 'number',
                labelAr: 'رسوم تحويل المشتري',
                labelEn: 'BUYER TRANSFER FEE',
              },
              {
                key: 'sellerTransferFee',
                resKey: 'sellerTransferFee',
                type: 'number',
                labelAr: 'رسوم تحويل البائع',
                labelEn: 'SELLER TRANSFER FEE',
              },
              {
                key: 'zonedFor',
                resKey: 'zonedFor',
                type: 'array',
                labelAr: 'مخصص لـ',
                labelEn: 'ZONED FOR',
              },
              {
                key: 'approvedBuildUpArea',
                resKey: 'approvedBuildUpArea',
                type: 'number',
                labelAr: 'مساحة البناء المعتمدة',
                labelEn: 'APPROVED BUILD UP AREA SIZE',
              },
              {
                key: 'freehold',
                resKey: 'freehold',
                type: 'boolean',
                labelAr: 'تملك حر',
                labelEn: 'FREEHOLD',
              },
            ],
          },
        },
        {
          nameAr: 'وحدات متعددة',
          nameEn: 'Multiple Units',
          customFields: {
            create: [
              {
                key: 'totalArea',
                resKey: 'totalArea',
                type: 'number',
                labelAr: '(قدم مربع) المساحة الكلية',
                labelEn: 'TOTAL AREA (SQ FT)',
              },
              {
                key: 'totalClosingFee',
                resKey: 'totalClosingFee',
                type: 'number',
                labelAr: 'إجمالي رسوم الإغلاق',
                labelEn: 'TOTAL CLOSING FEE',
              },
              {
                key: 'developer',
                resKey: 'developer',
                type: 'string',
                labelAr: 'المطور',
                labelEn: 'DEVELOPER',
              },
              {
                key: 'readyBy',
                resKey: 'readyBy',
                type: 'string',
                labelAr: 'جاهز بحلول',
                labelEn: 'READY BY',
              },
              {
                key: 'propertyReferenceId',
                resKey: 'propertyReferenceId',
                type: 'string',
                labelAr: 'رقم المرجع للعقار',
                labelEn: 'PROPERTY REFERENCE ID #',
              },
              {
                key: 'buyerTransferFee',
                resKey: 'buyerTransferFee',
                type: 'number',
                labelAr: 'رسوم تحويل المشتري',
                labelEn: 'BUYER TRANSFER FEE',
              },
              {
                key: 'sellerTransferFee',
                resKey: 'sellerTransferFee',
                type: 'number',
                labelAr: 'رسوم تحويل البائع',
                labelEn: 'SELLER TRANSFER FEE',
              },
              {
                key: 'maintenanceFee',
                resKey: 'maintenanceFee',
                type: 'number',
                labelAr: 'رسوم الصيانة',
                labelEn: 'MAINTENANCE FEE',
              },
              {
                key: 'occupancyStatus',
                resKey: 'occupancyStatus',
                type: 'string',
                labelAr: 'حالة الإشغال',
                labelEn: 'OCCUPANCY STATUS',
              },
              {
                key: 'zonedFor',
                resKey: 'zonedFor',
                type: 'array',
                labelAr: 'مخصص لـ',
                labelEn: 'ZONED FOR',
              },
            ],
          },
        },
      ],
    },
  });

  // 4. Cars
  await seedCategory('Cars', {
    nameAr: 'سيارات',
    nameEn: 'Cars',
    hasUsageCondition: true,
    bidderDepositFixedAmount: 500,
    sellerDepositFixedAmount: 500,
    subCategories: {
      create: [
        {
          nameEn: 'Sale',
          nameAr: 'للبيع',
        },
        {
          nameEn: 'Rent',
          nameAr: 'للإيجار',
        },
      ],
    },
    brands: {
      create: [
        { name: 'Alfa Romeo' },
        { name: 'Aston Martin' },
        { name: 'Audi' },
        { name: 'Bentley' },
        { name: 'BMW' },
        { name: 'Bugatti' },
        { name: 'Buick' },
        { name: 'Cadillac' },
        { name: 'Chevrolet' },
        { name: 'Chrysler' },
        { name: 'Citroën' },
        { name: 'Dacia' },
        { name: 'Dodge' },
        { name: 'Ferrari' },
        { name: 'Fiat' },
        { name: 'Ford' },
        { name: 'Genesis' },
        { name: 'GMC' },
        { name: 'Honda' },
        { name: 'Hyundai' },
        { name: 'Infiniti' },
        { name: 'Isuzu' },
        { name: 'Jaguar' },
        { name: 'Jeep' },
        { name: 'Kia' },
        { name: 'Koenigsegg' },
        { name: 'Lamborghini' },
        { name: 'Land Rover' },
        { name: 'Lexus' },
        { name: 'Lincoln' },
        { name: 'Lotus' },
        { name: 'Maserati' },
        { name: 'Mazda' },
        { name: 'McLaren' },
        { name: 'Mercedes-Benz' },
        { name: 'Mini' },
        { name: 'Mitsubishi' },
        { name: 'Nissan' },
        { name: 'Pagani' },
        { name: 'Peugeot' },
        { name: 'Porsche' },
        { name: 'Ram' },
        { name: 'Renault' },
        { name: 'Rolls-Royce' },
        { name: 'Saab' },
        { name: 'Seat' },
        { name: 'Škoda' },
        { name: 'Subaru' },
        { name: 'Suzuki' },
        { name: 'Tesla' },
        { name: 'Toyota' },
        { name: 'Volkswagen' },
        { name: 'Volvo' },
      ],
    },
    customFields: {
      create: [
        {
          key: 'color',
          resKey: 'color',
          type: 'array',
          labelAr: 'اللون',
          labelEn: 'COLOR',
        },
        {
          key: 'carType',
          resKey: 'carType',
          type: 'array',
          labelAr: 'نوع العربية',
          labelEn: 'CAR TYPE',
        },
        {
          key: 'brandId',
          resKey: 'brand',
          type: 'text',
          labelAr: 'ماركة',
          labelEn: 'BRAND',
        },
        {
          key: 'model',
          resKey: 'model',
          type: 'text',
          labelAr: 'موديل',
          labelEn: 'MODEL',
        },
      ],
    },
  });

  // Helper for Countries
  const seedCountry = async (nameEn: string, data: any) => {
    const exists = await prisma.country.findFirst({ where: { nameEn } });
    if (!exists) {
      return await prisma.country.create({ data });
    }
    return exists;
  };

  // Countries
  await seedCountry('United Arab Emirates', {
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
  });

  await seedCountry('Saudi Arabia', {
    nameAr: 'المملكة العربية السعودية',
    nameEn: 'Saudi Arabia',
    currency: 'SAR',
    cities: {
      create: [
        { nameAr: 'الرياض', nameEn: 'Riyadh' },
        { nameAr: 'جدة', nameEn: 'Jeddah' },
        { nameAr: 'مكة المكرمة', nameEn: 'Mecca' },
        { nameAr: 'المدينة المنورة', nameEn: 'Medina' },
        { nameAr: 'الدمام', nameEn: 'Dammam' },
        { nameAr: 'الخبر', nameEn: 'Khobar' },
        { nameAr: 'الظهران', nameEn: 'Dhahran' },
        { nameAr: 'الجبيل', nameEn: 'Jubail' },
        { nameAr: 'بريدة', nameEn: 'Buraydah' },
        { nameAr: 'تبوك', nameEn: 'Tabuk' },
        { nameAr: 'أبها', nameEn: 'Abha' },
        { nameAr: 'خميس مشيط', nameEn: 'Khamis Mushait' },
        { nameAr: 'حائل', nameEn: 'Hail' },
        { nameAr: 'الأحساء', nameEn: 'Al-Ahsa' },
        { nameAr: 'جازان', nameEn: 'Jazan' },
        { nameAr: 'نجران', nameEn: 'Najran' },
        { nameAr: 'ينبع', nameEn: 'Yanbu' },
      ],
    },
  });

  await seedCountry('Qatar', {
    nameAr: 'قطر',
    nameEn: 'Qatar',
    currency: 'QAR',
    cities: {
      create: [
        { nameAr: 'الدوحة', nameEn: 'Doha' },
        { nameAr: 'لوسيل', nameEn: 'Lusail' },
        { nameAr: 'الريان', nameEn: 'Al Rayyan' },
        { nameAr: 'الوكرة', nameEn: 'Al Wakrah' },
        { nameAr: 'الخور', nameEn: 'Al Khor' },
        { nameAr: 'مسيعيد', nameEn: 'Mesaieed' },
        { nameAr: 'مدينة الشمال', nameEn: 'Madinat ash Shamal' },
        { nameAr: 'الرويس', nameEn: 'Ar Ruwais' },
        { nameAr: 'أم صلال', nameEn: 'Umm Salal' },
        { nameAr: 'دخان', nameEn: 'Dukhan' },
        { nameAr: 'الشيحانية', nameEn: 'Al Shahaniya' },
      ],
    },
  });

  await seedCountry('Kuwait', {
    nameAr: 'الكويت',
    nameEn: 'Kuwait',
    currency: 'KWD',
    cities: {
      create: [
        { nameAr: 'مدينة الكويت', nameEn: 'Kuwait City' },
        { nameAr: 'السالمية', nameEn: 'Salmiya' },
        { nameAr: 'حوالي', nameEn: 'Hawalli' },
        { nameAr: 'الفروانية', nameEn: 'Farwaniya' },
        { nameAr: 'الأحمدي', nameEn: 'Al Ahmadi' },
        { nameAr: 'الفحيحيل', nameEn: 'Fahaheel' },
        { nameAr: 'الجهراء', nameEn: 'Jahra' },
        { nameAr: 'المنقف', nameEn: 'Mangaf' },
        { nameAr: 'المهبولة', nameEn: 'Mahboula' },
        { nameAr: 'صباح السالم', nameEn: 'Sabah Al-Salem' },
        { nameAr: 'خيطان', nameEn: 'Khaitan' },
      ],
    },
  });

  await seedCountry('Oman', {
    nameAr: 'عمان',
    nameEn: 'Oman',
    currency: 'OMR',
    cities: {
      create: [
        { nameAr: 'مسقط', nameEn: 'Muscat' },
        { nameAr: 'السيب', nameEn: 'Seeb' },
        { nameAr: 'صلالة', nameEn: 'Salalah' },
        { nameAr: 'صحار', nameEn: 'Sohar' },
        { nameAr: 'صور', nameEn: 'Sur' },
        { nameAr: 'بركاء', nameEn: 'Barka' },
        { nameAr: 'نزوى', nameEn: 'Nizwa' },
        { nameAr: 'عبري', nameEn: 'Ibri' },
        { nameAr: 'إبراء', nameEn: 'Ibra' },
        { nameAr: 'الرستاق', nameEn: 'Rustaq' },
        { nameAr: 'بهلا', nameEn: 'Bahla' },
        { nameAr: 'صحم', nameEn: 'Saham' },
        { nameAr: 'خصب', nameEn: 'Khasab' },
        { nameAr: 'البريمي', nameEn: 'Al Buraymi' },
        { nameAr: 'الدقم', nameEn: 'Duqm' },
      ],
    },
  });

  await seedCountry('Bahrain', {
    nameAr: 'البحرين',
    nameEn: 'Bahrain',
    currency: 'BHD',
    cities: {
      create: [
        { nameAr: 'المنامة', nameEn: 'Manama' },
        { nameAr: 'الرفاع', nameEn: 'Riffa' },
        { nameAr: 'المحرق', nameEn: 'Muharraq' },
        { nameAr: 'مدينة حمد', nameEn: 'Hamad Town' },
        { nameAr: 'مدينة عيسى', nameEn: 'Isa Town' },
        { nameAr: 'سترة', nameEn: 'Sitra' },
        { nameAr: 'البديع', nameEn: 'Budaiya' },
        { nameAr: 'الحد', nameEn: 'Al Hidd' },
        { nameAr: 'جد حفص', nameEn: 'Jidhafs' },
        { nameAr: 'سار', nameEn: 'Saar' },
        { nameAr: 'الزلاق', nameEn: 'Zallaq' },
      ],
    },
  });

  // App Version (createMany is not idempotent by name, so we use loop)
  const versions = [
    {
      platform: 'ios',
      version: '2.0.1',
      isLatest: true,
      isMinSupported: true,
      releaseNotes: 'Initial Release',
      downloadUrl: 'https://apps.apple.com/in/app/3arbon/id6745817658',
    },
    {
      platform: 'android',
      version: '2.0.0',
      isLatest: true,
      isMinSupported: true,
      releaseNotes: 'Initial Release',
      downloadUrl:
        'https://play.google.com/store/apps/details?id=com.alletre.app',
    },
  ];

  for (const v of versions) {
    const exists = await prisma.appVersion.findFirst({
      where: { platform: v.platform, version: v.version },
    });
    if (!exists) {
      await prisma.appVersion.create({ data: v });
    }
  }
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
