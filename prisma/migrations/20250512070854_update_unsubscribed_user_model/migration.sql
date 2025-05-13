/*
  Warnings:

  - A unique constraint covering the columns `[phone]` on the table `UnsubscribedUser` will be added. If there are existing duplicate values, this will fail.
  - Made the column `phone` on table `UnsubscribedUser` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "UnsubscribedUser" ALTER COLUMN "phone" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UnsubscribedUser_phone_key" ON "UnsubscribedUser"("phone");
