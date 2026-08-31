-- CreateEnum
CREATE TYPE "VenueTaskCategory" AS ENUM ('BROKEN_EQUIPMENT', 'LOW_STOCK', 'RUBBISH_REMOVAL', 'CLEANING', 'FURNITURE', 'BUILDING', 'MISC');

-- CreateEnum
CREATE TYPE "VenueTaskPriority" AS ENUM ('URGENT', 'NORMAL', 'WHENEVER');

-- CreateEnum
CREATE TYPE "VenueTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "VenueStockTracking" AS ENUM ('QUANTITY', 'SIGNAL');

-- CreateEnum
CREATE TYPE "VenueStockSignal" AS ENUM ('OK', 'LOW', 'OUT');

-- CreateEnum
CREATE TYPE "VenueStockMovementKind" AS ENUM ('TAKE', 'RECEIPT', 'COUNT', 'ADJUST');

-- AlterTable
ALTER TABLE "MaintenanceIssue" ADD COLUMN     "bookedAt" TIMESTAMP(3),
ADD COLUMN     "bookedBy" TEXT,
ADD COLUMN     "bookedFor" TIMESTAMP(3),
ADD COLUMN     "bookedNote" TEXT;

-- CreateTable
CREATE TABLE "VenueTask" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "category" "VenueTaskCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "reportedPriority" "VenueTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "priorityOverride" "VenueTaskPriority",
    "status" "VenueTaskStatus" NOT NULL DEFAULT 'OPEN',
    "reportedBy" TEXT,
    "ownedBy" TEXT,
    "stockItemId" TEXT,
    "maintenanceIssueId" TEXT,
    "doneBy" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueStockArea" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueStockArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueStockItem" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "tracking" "VenueStockTracking" NOT NULL DEFAULT 'SIGNAL',
    "parLevel" DECIMAL(10,2),
    "onHand" DECIMAL(10,2),
    "signal" "VenueStockSignal" NOT NULL DEFAULT 'OK',
    "signalAt" TIMESTAMP(3),
    "signalBy" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueStockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueStockMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" "VenueStockMovementKind" NOT NULL,
    "delta" DECIMAL(10,2) NOT NULL,
    "balance" DECIMAL(10,2),
    "countedTo" DECIMAL(10,2),
    "by" TEXT,
    "note" TEXT,
    "invoiceLineItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueStockSupplierMatch" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoiceDescription" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "conversionFactor" DECIMAL(12,6),
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "ignoredAt" TIMESTAMP(3),
    "ignoredBy" TEXT,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueStockSupplierMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VenueTask_maintenanceIssueId_key" ON "VenueTask"("maintenanceIssueId");

-- CreateIndex
CREATE INDEX "VenueTask_venue_status_idx" ON "VenueTask"("venue", "status");

-- CreateIndex
CREATE INDEX "VenueTask_venue_status_createdAt_idx" ON "VenueTask"("venue", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VenueTask_stockItemId_idx" ON "VenueTask"("stockItemId");

-- CreateIndex
CREATE INDEX "VenueStockArea_venue_isActive_idx" ON "VenueStockArea"("venue", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "VenueStockArea_venue_name_key" ON "VenueStockArea"("venue", "name");

-- CreateIndex
CREATE INDEX "VenueStockItem_areaId_isActive_idx" ON "VenueStockItem"("areaId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "VenueStockItem_areaId_name_key" ON "VenueStockItem"("areaId", "name");

-- CreateIndex
CREATE INDEX "VenueStockMovement_itemId_createdAt_idx" ON "VenueStockMovement"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "VenueStockMovement_invoiceLineItemId_idx" ON "VenueStockMovement"("invoiceLineItemId");

-- CreateIndex
CREATE INDEX "VenueStockSupplierMatch_itemId_idx" ON "VenueStockSupplierMatch"("itemId");

-- CreateIndex
CREATE INDEX "VenueStockSupplierMatch_supplierId_ignored_idx" ON "VenueStockSupplierMatch"("supplierId", "ignored");

-- CreateIndex
CREATE UNIQUE INDEX "VenueStockSupplierMatch_supplierId_invoiceDescription_key" ON "VenueStockSupplierMatch"("supplierId", "invoiceDescription");

-- AddForeignKey
ALTER TABLE "VenueTask" ADD CONSTRAINT "VenueTask_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "VenueStockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueTask" ADD CONSTRAINT "VenueTask_maintenanceIssueId_fkey" FOREIGN KEY ("maintenanceIssueId") REFERENCES "MaintenanceIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueStockItem" ADD CONSTRAINT "VenueStockItem_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "VenueStockArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueStockMovement" ADD CONSTRAINT "VenueStockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "VenueStockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueStockSupplierMatch" ADD CONSTRAINT "VenueStockSupplierMatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueStockSupplierMatch" ADD CONSTRAINT "VenueStockSupplierMatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "VenueStockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

