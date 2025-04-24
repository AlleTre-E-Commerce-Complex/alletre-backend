/*
  Warnings:

  - A unique constraint covering the columns `[transactionReference]` on the table `AlletreWallet` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[transactionReference]` on the table `Wallet` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "AlletreWallet" ADD COLUMN     "transactionReference" TEXT;

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "transactionReference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AlletreWallet_transactionReference_key" ON "AlletreWallet"("transactionReference");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_transactionReference_key" ON "Wallet"("transactionReference");
