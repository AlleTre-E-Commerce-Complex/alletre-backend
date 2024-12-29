/*
  Warnings:

  - You are about to drop the column `isWarningMessageSent` on the `JoinedAuction` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "JoinedAuction" DROP COLUMN "isWarningMessageSent",
ADD COLUMN     "isWarningMessageSent1Hour" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isWarningMessageSent24Hours" BOOLEAN NOT NULL DEFAULT false;
