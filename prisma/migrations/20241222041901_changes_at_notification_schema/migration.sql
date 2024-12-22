/*
  Warnings:

  - You are about to drop the column `html` on the `Notification` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "html",
ADD COLUMN     "imageLink" TEXT,
ADD COLUMN     "productTitle" TEXT;
