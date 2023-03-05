-- DropForeignKey
ALTER TABLE "CustomFields" DROP CONSTRAINT "CustomFields_subCategoryId_fkey";

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "hasUsageCondition" SET DEFAULT false;

-- AlterTable
ALTER TABLE "CustomFields" ALTER COLUMN "subCategoryId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "CustomFields" ADD CONSTRAINT "CustomFields_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
