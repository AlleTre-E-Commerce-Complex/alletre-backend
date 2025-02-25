-- AlterTable
ALTER TABLE "NonRegisteredUser" ADD COLUMN     "categoryId" INTEGER;

-- AddForeignKey
ALTER TABLE "NonRegisteredUser" ADD CONSTRAINT "NonRegisteredUser_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
