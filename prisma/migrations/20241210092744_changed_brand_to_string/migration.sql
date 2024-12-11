-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_brandId_fkey";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "brand" TEXT;
