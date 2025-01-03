-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('PENDING', 'SOLVED', 'IN_PROGRESS');

-- CreateEnum
CREATE TYPE "WalletStatus" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('By_AUCTION', 'BY_DIRECT_SELL');

-- CreateEnum
CREATE TYPE "UsageStatus" AS ENUM ('NEW', 'USED', 'OPEN_BOX');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('DRAFTED', 'PENDING_OWNER_DEPOIST', 'ACTIVE', 'IN_SCHEDULED', 'ARCHIVED', 'SOLD', 'WAITING_FOR_PAYMENT', 'EXPIRED', 'CANCELLED_BEFORE_EXP_DATE', 'CANCELLED_AFTER_EXP_DATE');

-- CreateEnum
CREATE TYPE "AuctionType" AS ENUM ('ON_TIME', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "DurationUnits" AS ENUM ('DAYS', 'HOURS');

-- CreateEnum
CREATE TYPE "OAuthType" AS ENUM ('GOOGLE', 'FACEBOOK', 'APPLE');

-- CreateEnum
CREATE TYPE "JoinedAuctionStatus" AS ENUM ('IN_PROGRESS', 'PENDING_PAYMENT', 'WAITING_FOR_DELIVERY', 'PAYMENT_EXPIRED', 'LOST', 'COMPLETED', 'CANCELLED_BEFORE_EXP_DATE', 'CANCELLED_AFTER_EXP_DATE');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('SELLER_DEPOSIT', 'BIDDER_DEPOSIT', 'AUCTION_PURCHASE', 'BUY_NOW_PURCHASE');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('NOT_SPECIFIED', 'PICKUP', 'DELIVERY');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "userName" TEXT,
    "email" TEXT,
    "password" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imageLink" TEXT,
    "imagePath" TEXT,
    "isOAuth" BOOLEAN NOT NULL DEFAULT false,
    "hasCompletedProfile" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "oAuthType" "OAuthType",
    "ipAddress" TEXT,
    "socketId" TEXT,
    "stripeId" TEXT,
    "stripeConnectedAccountId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscribedUser" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscribedUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "id" SERIAL NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" SERIAL NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "routingNumber" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalRequests" (
    "id" SERIAL NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "referenceNumber" SERIAL NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "withdrawalStatus" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "WithdrawalRequests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" SERIAL NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "countryId" INTEGER NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "countryId" INTEGER NOT NULL,
    "cityId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "zipCode" TEXT,
    "addressLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isMain" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasUsageCondition" BOOLEAN NOT NULL DEFAULT false,
    "sellerDepositFixedAmount" DECIMAL(65,30),
    "bidderDepositFixedAmount" DECIMAL(65,30),
    "bannerLink" TEXT,
    "bannerPath" TEXT,
    "sliderLink" TEXT,
    "sliderPath" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubCategory" (
    "id" SERIAL NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imageLink" TEXT,
    "imagePath" TEXT,

    CONSTRAINT "SubCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFields" (
    "id" SERIAL NOT NULL,
    "subCategoryId" INTEGER,
    "categoryId" INTEGER,
    "key" TEXT NOT NULL,
    "resKey" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,

    CONSTRAINT "CustomFields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "subCategoryId" INTEGER,
    "brandId" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "model" TEXT,
    "usageStatus" "UsageStatus",
    "description" TEXT NOT NULL,
    "color" TEXT,
    "screenSize" DOUBLE PRECISION,
    "processor" TEXT,
    "operatingSystem" TEXT,
    "releaseYear" TEXT,
    "regionOfManufacture" TEXT,
    "ramSize" INTEGER,
    "isOffer" BOOLEAN NOT NULL DEFAULT false,
    "offerAmount" DECIMAL(65,30) DEFAULT 0,
    "cameraType" TEXT,
    "material" TEXT,
    "memory" TEXT,
    "age" INTEGER,
    "totalArea" DOUBLE PRECISION,
    "numberOfRooms" INTEGER,
    "numberOfFloors" INTEGER,
    "landType" TEXT,
    "countryId" INTEGER,
    "cityId" INTEGER,
    "carType" TEXT,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Image" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "imagePath" TEXT NOT NULL,
    "imageLink" TEXT NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "fcmToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "locationId" INTEGER,
    "status" "AuctionStatus" NOT NULL DEFAULT 'PENDING_OWNER_DEPOIST',
    "type" "AuctionType",
    "durationUnit" "DurationUnits",
    "durationInDays" INTEGER,
    "durationInHours" INTEGER,
    "startBidAmount" DECIMAL(65,30),
    "isBuyNowAllowed" BOOLEAN NOT NULL DEFAULT false,
    "isItemSendForDelivery" BOOLEAN DEFAULT false,
    "IsDelivery" BOOLEAN DEFAULT false,
    "deliveryPolicyDescription" TEXT,
    "numOfDaysOfExpecetdDelivery" INTEGER,
    "deliveryType" "DeliveryType" DEFAULT 'NOT_SPECIFIED',
    "DeliveryFees" DECIMAL(65,30),
    "IsReturnPolicy" BOOLEAN DEFAULT false,
    "returnPolicyDescription" TEXT,
    "IsWarranty" BOOLEAN DEFAULT false,
    "warrantyPolicyDescription" TEXT,
    "acceptedAmount" DECIMAL(65,30),
    "startDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "buyerId" INTEGER NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productQuantity" INTEGER NOT NULL DEFAULT 1,
    "productAmount" DECIMAL(65,30) NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchList" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "auctionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bids" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "auctionId" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "auctionId" INTEGER NOT NULL,
    "paymentIntentId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "PaymentType",
    "isWalletPayment" BOOLEAN NOT NULL DEFAULT false,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JoinedAuction" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "auctionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JoinedAuctionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "paymentExpiryDate" TIMESTAMP(3),
    "isWarningMessageSent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "JoinedAuction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "imageLink" TEXT,
    "imagePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "auctionId" INTEGER,
    "purchaseId" INTEGER,
    "amount" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "status" "WalletStatus" NOT NULL,
    "transactionType" "WalletTransactionType" NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlletreWallet" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "auctionId" INTEGER,
    "purchaseId" INTEGER,
    "amount" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "status" "WalletStatus" NOT NULL,
    "transactionType" "WalletTransactionType" NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "AlletreWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionComplaints" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "auctionId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,
    "auctionStatus" "JoinedAuctionStatus" NOT NULL,
    "problemStatus" "ProblemStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "AuctionComplaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintImages" (
    "id" SERIAL NOT NULL,
    "complaintId" INTEGER NOT NULL,
    "imagePath" TEXT NOT NULL,
    "imageLink" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintImages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "auctionId" INTEGER,
    "message" TEXT NOT NULL,
    "html" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "SubscribedUser_email_key" ON "SubscribedUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalRequests_referenceNumber_key" ON "WithdrawalRequests"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_userId_key" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Auction_productId_key" ON "Auction"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_productId_key" ON "Purchase"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentIntentId_key" ON "Payment"("paymentIntentId");

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequests" ADD CONSTRAINT "WithdrawalRequests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequests" ADD CONSTRAINT "WithdrawalRequests_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubCategory" ADD CONSTRAINT "SubCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFields" ADD CONSTRAINT "CustomFields_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFields" ADD CONSTRAINT "CustomFields_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchList" ADD CONSTRAINT "WatchList_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchList" ADD CONSTRAINT "WatchList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bids" ADD CONSTRAINT "Bids_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bids" ADD CONSTRAINT "Bids_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinedAuction" ADD CONSTRAINT "JoinedAuction_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinedAuction" ADD CONSTRAINT "JoinedAuction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlletreWallet" ADD CONSTRAINT "AlletreWallet_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlletreWallet" ADD CONSTRAINT "AlletreWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlletreWallet" ADD CONSTRAINT "AlletreWallet_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionComplaints" ADD CONSTRAINT "AuctionComplaints_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionComplaints" ADD CONSTRAINT "AuctionComplaints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintImages" ADD CONSTRAINT "ComplaintImages_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "AuctionComplaints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

