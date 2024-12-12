/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `PushSubscription` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_userId_key" ON "PushSubscription"("userId");
