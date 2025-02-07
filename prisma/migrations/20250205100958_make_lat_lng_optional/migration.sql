-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "status" SET DEFAULT true;

-- AlterTable
ALTER TABLE "Location" ALTER COLUMN "lat" DROP NOT NULL,
ALTER COLUMN "lng" DROP NOT NULL;
