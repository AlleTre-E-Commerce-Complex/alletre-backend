-- CreateEnum
CREATE TYPE "JoinedAuctionStatus" AS ENUM ('IN_PROGRESS', 'PENDING_PAYMENT', 'WAITING_FOR_DELIVERY', 'PAYMENT_EXPIRED', 'LOST', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('SELLER_DEPOSIT', 'BIDDER_DEPOSIT');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "type" "PaymentType";

-- CreateTable
CREATE TABLE "JoinedAuction" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "auctionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JoinedAuctionStatus" NOT NULL DEFAULT 'IN_PROGRESS',

    CONSTRAINT "JoinedAuction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "JoinedAuction" ADD CONSTRAINT "JoinedAuction_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinedAuction" ADD CONSTRAINT "JoinedAuction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
