-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_subCategoryId_fkey";

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "subCategoryId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
