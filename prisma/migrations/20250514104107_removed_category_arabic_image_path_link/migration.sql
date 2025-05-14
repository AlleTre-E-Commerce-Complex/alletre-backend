/*
  Warnings:

  - You are about to drop the column `sliderLinkAr` on the `Category` table. All the data in the column will be lost.
  - You are about to drop the column `sliderPathAr` on the `Category` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Category" DROP COLUMN "sliderLinkAr",
DROP COLUMN "sliderPathAr";

-- CreateTable
CREATE TABLE "Profit" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "auctionId" INTEGER,
    "purchaseId" INTEGER,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,

    CONSTRAINT "Profit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Profit" ADD CONSTRAINT "Profit_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profit" ADD CONSTRAINT "Profit_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profit" ADD CONSTRAINT "Profit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
