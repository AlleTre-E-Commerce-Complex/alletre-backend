-- CreateTable
CREATE TABLE "AppVersion" (
    "id" SERIAL NOT NULL,
    "platform" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT false,
    "isMinSupported" BOOLEAN NOT NULL DEFAULT false,
    "releaseNotes" TEXT,
    "downloadUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppVersion_platform_isLatest_idx" ON "AppVersion"("platform", "isLatest");

-- CreateIndex
CREATE INDEX "AppVersion_platform_isMinSupported_idx" ON "AppVersion"("platform", "isMinSupported");
