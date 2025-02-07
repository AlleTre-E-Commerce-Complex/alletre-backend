/*
  Warnings:

  - You are about to drop the column `cityId` on the `Location` table. All the data in the column will be lost.
  - You are about to drop the column `countryId` on the `Location` table. All the data in the column will be lost.
  - Added the required column `city` to the `Location` table without a default value. This is not possible if the table is not empty.
  - Added the required column `country` to the `Location` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Location" DROP CONSTRAINT "Location_cityId_fkey";

-- DropForeignKey
ALTER TABLE "Location" DROP CONSTRAINT "Location_countryId_fkey";

-- AlterTable
ALTER TABLE "Location" DROP COLUMN "cityId",
DROP COLUMN "countryId",
ADD COLUMN     "city" TEXT NOT NULL,
ADD COLUMN     "country" TEXT NOT NULL;
