/*
  Warnings:

  - The values [ON_SCHEDULING,DELETED] on the enum `AuctionStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AuctionStatus_new" AS ENUM ('DRAFTED', 'PENDING_OWNER_DEPOIST', 'PUBLISHED', 'ARCHIVED', 'SOLD', 'EXPIRED');
ALTER TABLE "Auction" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Auction" ALTER COLUMN "status" TYPE "AuctionStatus_new" USING ("status"::text::"AuctionStatus_new");
ALTER TYPE "AuctionStatus" RENAME TO "AuctionStatus_old";
ALTER TYPE "AuctionStatus_new" RENAME TO "AuctionStatus";
DROP TYPE "AuctionStatus_old";
ALTER TABLE "Auction" ALTER COLUMN "status" SET DEFAULT 'PENDING_OWNER_DEPOIST';
COMMIT;
