-- CreateEnum
CREATE TYPE "KitchenStation" AS ENUM ('RESTAURANT', 'CAFE', 'MAIN');

-- CreateEnum
CREATE TYPE "RestockSheetStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'RESTOCKED');

-- CreateTable
CREATE TABLE "PrepStockItem" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL DEFAULT 'BEACH_HOUSE',
    "station" "KitchenStation" NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Station restock',
    "parLevel" DECIMAL(8,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "preparationId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrepStockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestockSheet" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL DEFAULT 'BEACH_HOUSE',
    "station" "KitchenStation" NOT NULL,
    "sheetDate" DATE NOT NULL,
    "status" "RestockSheetStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "countedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "restockedBy" TEXT,
    "restockedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestockSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestockLine" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "available" DECIMAL(8,2),
    "requested" DECIMAL(8,2),
    "supplied" DECIMAL(8,2),
    "priority" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "suppliedBy" TEXT,
    "suppliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestockLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrepStockItem_venue_station_isActive_idx" ON "PrepStockItem"("venue", "station", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PrepStockItem_venue_station_name_key" ON "PrepStockItem"("venue", "station", "name");

-- CreateIndex
CREATE INDEX "RestockSheet_venue_status_idx" ON "RestockSheet"("venue", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RestockSheet_venue_station_sheetDate_key" ON "RestockSheet"("venue", "station", "sheetDate");

-- CreateIndex
CREATE INDEX "RestockLine_itemId_idx" ON "RestockLine"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "RestockLine_sheetId_itemId_key" ON "RestockLine"("sheetId", "itemId");

-- AddForeignKey
ALTER TABLE "PrepStockItem" ADD CONSTRAINT "PrepStockItem_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "Preparation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestockLine" ADD CONSTRAINT "RestockLine_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "RestockSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestockLine" ADD CONSTRAINT "RestockLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PrepStockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

