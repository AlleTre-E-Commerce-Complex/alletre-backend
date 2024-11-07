-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'HOLD', 'CANCELLED');

-- AlterTable
ALTER TABLE "Auction" ADD COLUMN     "IsDelivery" BOOLEAN DEFAULT false,
ADD COLUMN     "IsReturnPolicy" BOOLEAN DEFAULT false,
ADD COLUMN     "IsWarranty" BOOLEAN DEFAULT false,
ADD COLUMN     "deliveryPolicyDescription" TEXT,
ADD COLUMN     "numOfDaysOfExpecetdDelivery" INTEGER,
ADD COLUMN     "returnPolicyDescription" TEXT,
ADD COLUMN     "warrantyPolicyDescription" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "isWalletPayment" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "paymentIntentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "stripeConnectedAccountId" TEXT;

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

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalRequests_referenceNumber_key" ON "WithdrawalRequests"("referenceNumber");

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequests" ADD CONSTRAINT "WithdrawalRequests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequests" ADD CONSTRAINT "WithdrawalRequests_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
