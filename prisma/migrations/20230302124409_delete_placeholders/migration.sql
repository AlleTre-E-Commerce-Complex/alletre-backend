/*
  Warnings:

  - You are about to drop the column `placeHolderAr` on the `CustomFields` table. All the data in the column will be lost.
  - You are about to drop the column `placeHolderEn` on the `CustomFields` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "hasUsageCondition" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "CustomFields" DROP COLUMN "placeHolderAr",
DROP COLUMN "placeHolderEn";
