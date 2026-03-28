-- CreateEnum
CREATE TYPE "WasteReason" AS ENUM ('OVERPRODUCTION', 'SPOILAGE', 'EXPIRED', 'DROPPED', 'STAFF_MEAL', 'CUSTOMER_RETURN', 'QUALITY_ISSUE', 'OTHER');

-- CreateTable
CREATE TABLE "LightspeedConnection" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "businessId" TEXT,
    "businessLocations" JSONB,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LightspeedConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySales" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "venue" "Venue" NOT NULL,
    "menuItemName" TEXT NOT NULL,
    "menuItemId" TEXT,
    "dishId" TEXT,
    "quantitySold" INTEGER NOT NULL,
    "revenue" DECIMAL(12,2) NOT NULL,
    "revenueExGst" DECIMAL(12,2) NOT NULL,
    "voids" INTEGER NOT NULL DEFAULT 0,
    "comps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySalesSummary" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "venue" "Venue" NOT NULL,
    "totalRevenue" DECIMAL(12,2) NOT NULL,
    "totalRevenueExGst" DECIMAL(12,2) NOT NULL,
    "totalCovers" INTEGER NOT NULL,
    "averageSpend" DECIMAL(8,2) NOT NULL,
    "totalVoids" INTEGER NOT NULL,
    "totalComps" INTEGER NOT NULL,
    "theoreticalCogs" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySalesSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WasteEntry" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "venue" "Venue" NOT NULL,
    "dishId" TEXT,
    "ingredientId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "reason" "WasteReason" NOT NULL,
    "estimatedCost" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WasteEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TheoreticalUsage" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "venue" "Venue" NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "theoreticalQty" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "theoreticalCost" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TheoreticalUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailySales_date_venue_menuItemName_key" ON "DailySales"("date", "venue", "menuItemName");

-- CreateIndex
CREATE INDEX "DailySales_date_venue_idx" ON "DailySales"("date", "venue");

-- CreateIndex
CREATE INDEX "DailySales_dishId_idx" ON "DailySales"("dishId");

-- CreateIndex
CREATE UNIQUE INDEX "DailySalesSummary_date_venue_key" ON "DailySalesSummary"("date", "venue");

-- CreateIndex
CREATE INDEX "WasteEntry_date_venue_idx" ON "WasteEntry"("date", "venue");

-- CreateIndex
CREATE INDEX "WasteEntry_reason_idx" ON "WasteEntry"("reason");

-- CreateIndex
CREATE UNIQUE INDEX "TheoreticalUsage_date_venue_ingredientId_key" ON "TheoreticalUsage"("date", "venue", "ingredientId");

-- AddForeignKey
ALTER TABLE "DailySales" ADD CONSTRAINT "DailySales_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WasteEntry" ADD CONSTRAINT "WasteEntry_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WasteEntry" ADD CONSTRAINT "WasteEntry_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheoreticalUsage" ADD CONSTRAINT "TheoreticalUsage_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
