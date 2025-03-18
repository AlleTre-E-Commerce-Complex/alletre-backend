-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "luxuaryAmount" DECIMAL(65,30),
ADD COLUMN     "maxBidLimit" DECIMAL(65,30),
ADD COLUMN     "maxStartPrice" DECIMAL(65,30),
ADD COLUMN     "minimumLuxuarySD_forBidder" DECIMAL(65,30),
ADD COLUMN     "minimumLuxuarySD_forSeller" DECIMAL(65,30),
ADD COLUMN     "percentageOfLuxuarySD_forBidder" DECIMAL(65,30),
ADD COLUMN     "percentageOfLuxuarySD_forSeller" DECIMAL(65,30);
