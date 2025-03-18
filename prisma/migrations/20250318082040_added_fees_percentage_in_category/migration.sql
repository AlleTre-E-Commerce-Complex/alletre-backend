-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "LuxuaryFeesPercentage" DECIMAL(65,30) DEFAULT 2,
ADD COLUMN     "feesPercentage" DECIMAL(65,30) DEFAULT 0.5;
