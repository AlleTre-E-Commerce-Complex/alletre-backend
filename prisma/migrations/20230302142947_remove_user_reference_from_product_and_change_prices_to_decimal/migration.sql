/*
  Warnings:

  - You are about to drop the column `price` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Product` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_userId_fkey";

-- AlterTable
ALTER TABLE "Auction" ALTER COLUMN "startBidAmount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "acceptedAmount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "price",
DROP COLUMN "userId";
