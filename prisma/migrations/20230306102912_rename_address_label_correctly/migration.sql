/*
  Warnings:

  - You are about to drop the column `addresLabel` on the `Location` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Location" DROP COLUMN "addresLabel",
ADD COLUMN     "addressLabel" TEXT;
