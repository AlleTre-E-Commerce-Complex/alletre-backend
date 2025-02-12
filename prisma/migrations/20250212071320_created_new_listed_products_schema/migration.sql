-- CreateEnum
CREATE TYPE "ListedProductsStatus" AS ENUM ('IN_PROGRESS', 'OUT_OF_STOCK', 'SOLD_OUT');

-- CreateTable
CREATE TABLE "ListedProducts" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "status" "ListedProductsStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "userId" INTEGER NOT NULL,
    "locationId" INTEGER,
    "ProductListingPrice" DECIMAL(65,30) DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListedProducts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListedProducts_productId_key" ON "ListedProducts"("productId");

-- AddForeignKey
ALTER TABLE "ListedProducts" ADD CONSTRAINT "ListedProducts_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListedProducts" ADD CONSTRAINT "ListedProducts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListedProducts" ADD CONSTRAINT "ListedProducts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
