-- CreateEnum
CREATE TYPE "PastryBakeTime" AS ENUM ('SIX_AM', 'NINE_AM', 'TWELVE_PM');

-- CreateTable
CREATE TABLE "PastryProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "venue" "Venue" NOT NULL DEFAULT 'BOTH',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PastryProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PastryProduct_venue_name_key" ON "PastryProduct"("venue", "name");

-- CreateIndex
CREATE INDEX "PastryProduct_venue_isActive_sortOrder_idx" ON "PastryProduct"("venue", "isActive", "sortOrder");

-- CreateTable
CREATE TABLE "PastryRotationEntry" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "entryDate" DATE NOT NULL,
    "bakeTime" "PastryBakeTime" NOT NULL,
    "productId" TEXT NOT NULL,
    "prepared" INTEGER NOT NULL DEFAULT 0,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "discarded" INTEGER NOT NULL DEFAULT 0,
    "staffName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PastryRotationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PastryRotationEntry_venue_entryDate_bakeTime_productId_key" ON "PastryRotationEntry"("venue", "entryDate", "bakeTime", "productId");

-- CreateIndex
CREATE INDEX "PastryRotationEntry_venue_entryDate_idx" ON "PastryRotationEntry"("venue", "entryDate");

-- AddForeignKey
ALTER TABLE "PastryRotationEntry" ADD CONSTRAINT "PastryRotationEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PastryProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
