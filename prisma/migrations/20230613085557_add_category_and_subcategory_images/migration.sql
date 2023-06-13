-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "bannerLink" TEXT,
ADD COLUMN     "bannerPath" TEXT,
ADD COLUMN     "sliderLink" TEXT,
ADD COLUMN     "sliderPath" TEXT;

-- AlterTable
ALTER TABLE "SubCategory" ADD COLUMN     "imageLink" TEXT,
ADD COLUMN     "imagePath" TEXT;
