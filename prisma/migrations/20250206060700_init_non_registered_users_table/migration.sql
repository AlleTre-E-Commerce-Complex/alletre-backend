-- CreateTable
CREATE TABLE "NonRegisteredUser" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "address" TEXT,
    "companyName" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NonRegisteredUser_pkey" PRIMARY KEY ("id")
);
