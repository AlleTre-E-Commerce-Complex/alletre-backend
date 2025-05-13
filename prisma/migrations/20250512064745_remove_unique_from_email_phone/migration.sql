-- DropIndex
DROP INDEX "UnsubscribedUser_email_key";

-- DropIndex
DROP INDEX "UnsubscribedUser_phone_key";

-- AlterTable
ALTER TABLE "UnsubscribedUser" ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;
