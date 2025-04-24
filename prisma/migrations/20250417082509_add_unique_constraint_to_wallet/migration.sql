/*
  Warnings:

  - A unique constraint covering the columns `[userId,auctionId,description]` on the table `Wallet` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_auctionId_description_key" ON "Wallet"("userId", "auctionId", "description");
