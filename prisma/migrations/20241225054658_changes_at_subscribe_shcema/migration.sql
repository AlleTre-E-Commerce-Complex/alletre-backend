/*
  Warnings:

  - Added the required column `isActive` to the `SubscribedUser` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SubscribedUser" ADD COLUMN     "isActive" BOOLEAN NOT NULL;
