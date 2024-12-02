-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('NOT_SPECIFIED', 'PICKUP', 'DELIVERY');

-- AlterTable
ALTER TABLE "Auction" ADD COLUMN     "deliveryType" "DeliveryType" DEFAULT 'NOT_SPECIFIED';
