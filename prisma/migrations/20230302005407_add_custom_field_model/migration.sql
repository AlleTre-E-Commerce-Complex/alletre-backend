/*
  Warnings:

  - The values [QUICK,DAILY,SCHEDULED_QUICK,SCHEDULED_DAILY] on the enum `AuctionType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `endDate` on the `Auction` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Category` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `Location` table. All the data in the column will be lost.
  - You are about to drop the column `country` on the `Location` table. All the data in the column will be lost.
  - You are about to drop the column `streetName` on the `Location` table. All the data in the column will be lost.
  - You are about to drop the column `subAdministrativeArea` on the `Location` table. All the data in the column will be lost.
  - You are about to drop the column `brand` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `SubCategory` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[productId]` on the table `Auction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `durationUnit` to the `Auction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `locationId` to the `Auction` table without a default value. This is not possible if the table is not empty.
  - Made the column `startDate` on table `Auction` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `nameAr` to the `Category` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nameEn` to the `Category` table without a default value. This is not possible if the table is not empty.
  - Made the column `imagePath` on table `Image` required. This step will fail if there are existing NULL values in that column.
  - Made the column `imageLink` on table `Image` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `address` to the `Location` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cityId` to the `Location` table without a default value. This is not possible if the table is not empty.
  - Added the required column `countryId` to the `Location` table without a default value. This is not possible if the table is not empty.
  - Added the required column `brandId` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nameAr` to the `SubCategory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nameEn` to the `SubCategory` table without a default value. This is not possible if the table is not empty.
  - Made the column `email` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `password` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `phone` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "DurationUnits" AS ENUM ('DAYS', 'HOURS');

-- AlterEnum
BEGIN;
CREATE TYPE "AuctionType_new" AS ENUM ('ON_TIME', 'SCHEDULED');
ALTER TABLE "Auction" ALTER COLUMN "type" TYPE "AuctionType_new" USING ("type"::text::"AuctionType_new");
ALTER TYPE "AuctionType" RENAME TO "AuctionType_old";
ALTER TYPE "AuctionType_new" RENAME TO "AuctionType";
DROP TYPE "AuctionType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Auction" DROP COLUMN "endDate",
ADD COLUMN     "durationUnit" "DurationUnits" NOT NULL,
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "locationId" INTEGER NOT NULL,
ALTER COLUMN "startDate" SET NOT NULL;

-- AlterTable
ALTER TABLE "Category" DROP COLUMN "name",
ADD COLUMN     "nameAr" TEXT NOT NULL,
ADD COLUMN     "nameEn" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Image" ALTER COLUMN "imagePath" SET NOT NULL,
ALTER COLUMN "imageLink" SET NOT NULL;

-- AlterTable
ALTER TABLE "Location" DROP COLUMN "city",
DROP COLUMN "country",
DROP COLUMN "streetName",
DROP COLUMN "subAdministrativeArea",
ADD COLUMN     "address" TEXT NOT NULL,
ADD COLUMN     "cityId" INTEGER NOT NULL,
ADD COLUMN     "countryId" INTEGER NOT NULL,
ADD COLUMN     "zipCode" TEXT;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "brand",
ADD COLUMN     "age" TEXT,
ADD COLUMN     "brandId" INTEGER NOT NULL,
ADD COLUMN     "cameraType" TEXT,
ADD COLUMN     "cityId" INTEGER,
ADD COLUMN     "countryId" INTEGER,
ADD COLUMN     "landType" TEXT,
ADD COLUMN     "material" TEXT,
ADD COLUMN     "numberOfFloors" INTEGER,
ADD COLUMN     "numberOfRooms" INTEGER,
ADD COLUMN     "operatingSystem" TEXT,
ADD COLUMN     "processor" TEXT,
ADD COLUMN     "ramSize" INTEGER,
ADD COLUMN     "regionOfManufacture" TEXT,
ADD COLUMN     "releaseYear" TEXT,
ADD COLUMN     "screenSize" INTEGER,
ADD COLUMN     "totalArea" INTEGER,
ALTER COLUMN "usageStatus" DROP NOT NULL,
ALTER COLUMN "price" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "description" SET DATA TYPE TEXT,
ALTER COLUMN "color" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SubCategory" DROP COLUMN "name",
ADD COLUMN     "nameAr" TEXT NOT NULL,
ADD COLUMN     "nameEn" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "password" SET NOT NULL,
ALTER COLUMN "phone" SET NOT NULL;

-- CreateTable
CREATE TABLE "Country" (
    "id" SERIAL NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" SERIAL NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "countryId" INTEGER NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFields" (
    "id" SERIAL NOT NULL,
    "subCategoryId" INTEGER NOT NULL,
    "categoryId" INTEGER,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "placeHolderAr" TEXT,
    "placeHolderEn" TEXT,

    CONSTRAINT "CustomFields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Auction_productId_key" ON "Auction"("productId");

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFields" ADD CONSTRAINT "CustomFields_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFields" ADD CONSTRAINT "CustomFields_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
