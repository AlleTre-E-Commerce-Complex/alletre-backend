/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `UnsubscribedUser` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `UnsubscribedUser` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "UnsubscribedUser" ADD COLUMN     "email" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UnsubscribedUser_email_key" ON "UnsubscribedUser"("email");
