/*
  Warnings:

  - You are about to drop the column `subscription` on the `PushSubscription` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PushSubscription" DROP COLUMN "subscription",
ADD COLUMN     "fcmToken" TEXT;
