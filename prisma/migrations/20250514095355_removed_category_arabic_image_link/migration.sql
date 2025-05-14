/*
  Warnings:

  - You are about to drop the `Profit` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Profit" DROP CONSTRAINT "Profit_auctionId_fkey";

-- DropForeignKey
ALTER TABLE "Profit" DROP CONSTRAINT "Profit_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "Profit" DROP CONSTRAINT "Profit_userId_fkey";

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "sliderLinkAr" TEXT,
ADD COLUMN     "sliderPathAr" TEXT;

-- DropTable
DROP TABLE "Profit";
