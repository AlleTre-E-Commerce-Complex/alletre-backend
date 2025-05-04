/*
  Warnings:

  - You are about to alter the column `amount` on the `AlletreWallet` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(30,30)`.
  - You are about to alter the column `balance` on the `AlletreWallet` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(30,30)`.
  - You are about to alter the column `amount` on the `Wallet` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(30,30)`.
  - You are about to alter the column `balance` on the `Wallet` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(30,30)`.

*/
-- AlterTable
ALTER TABLE "AlletreWallet" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(30,30),
ALTER COLUMN "balance" SET DATA TYPE DECIMAL(30,30);

-- AlterTable
ALTER TABLE "Auction" ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedByUserId" INTEGER;

-- AlterTable
ALTER TABLE "Wallet" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(30,30),
ALTER COLUMN "balance" SET DATA TYPE DECIMAL(30,30);
