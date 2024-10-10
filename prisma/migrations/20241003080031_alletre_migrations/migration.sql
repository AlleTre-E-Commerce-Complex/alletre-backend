-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('PENDING', 'SOLVED', 'IN_PROGRESS');

-- CreateEnum
CREATE TYPE "WalletStatus" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('By_AUCTION', 'BY_DIRECT_SELL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuctionStatus" ADD VALUE 'CANCELLED_BEFORE_EXP_DATE';
ALTER TYPE "AuctionStatus" ADD VALUE 'CANCELLED_AFTER_EXP_DATE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JoinedAuctionStatus" ADD VALUE 'CANCELLED_BEFORE_EXP_DATE';
ALTER TYPE "JoinedAuctionStatus" ADD VALUE 'CANCELLED_AFTER_EXP_DATE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'HOLD';
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "JoinedAuction" ADD COLUMN     "isWarningMessageSent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Purchase" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "buyerId" INTEGER NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productQuantity" INTEGER NOT NULL DEFAULT 1,
    "productAmount" DECIMAL(65,30) NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "auctionId" INTEGER,
    "purchaseId" INTEGER,
    "amount" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "status" "WalletStatus" NOT NULL,
    "transactionType" "WalletTransactionType" NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlletreWallet" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "auctionId" INTEGER,
    "purchaseId" INTEGER,
    "amount" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "status" "WalletStatus" NOT NULL,
    "transactionType" "WalletTransactionType" NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "AlletreWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionComplaints" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "auctionId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,
    "auctionStatus" "JoinedAuctionStatus" NOT NULL,
    "problemStatus" "ProblemStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "AuctionComplaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintImages" (
    "id" SERIAL NOT NULL,
    "complaintId" INTEGER NOT NULL,
    "imagePath" TEXT NOT NULL,
    "imageLink" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintImages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_productId_key" ON "Purchase"("productId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlletreWallet" ADD CONSTRAINT "AlletreWallet_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlletreWallet" ADD CONSTRAINT "AlletreWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlletreWallet" ADD CONSTRAINT "AlletreWallet_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionComplaints" ADD CONSTRAINT "AuctionComplaints_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionComplaints" ADD CONSTRAINT "AuctionComplaints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintImages" ADD CONSTRAINT "ComplaintImages_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "AuctionComplaints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
