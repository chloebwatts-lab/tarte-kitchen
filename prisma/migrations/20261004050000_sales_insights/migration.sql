-- Sales insights page (Square-style live view with Lightspeed history).
CREATE TABLE IF NOT EXISTS "HourlySales" (
  "id" TEXT NOT NULL, "date" DATE NOT NULL, "venue" "Venue" NOT NULL, "hour" INTEGER NOT NULL,
  "revenueIncGst" DECIMAL(12,2) NOT NULL, "orders" INTEGER NOT NULL DEFAULT 0, "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "HourlySales_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "HourlySales_date_venue_hour_key" ON "HourlySales"("date","venue","hour");
CREATE INDEX IF NOT EXISTS "HourlySales_venue_date_idx" ON "HourlySales"("venue","date");

CREATE TABLE IF NOT EXISTS "DailyChannelSales" (
  "id" TEXT NOT NULL, "date" DATE NOT NULL, "venue" "Venue" NOT NULL, "channel" TEXT NOT NULL,
  "revenueIncGst" DECIMAL(12,2) NOT NULL, "orders" INTEGER NOT NULL DEFAULT 0, "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DailyChannelSales_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "DailyChannelSales_date_venue_channel_key" ON "DailyChannelSales"("date","venue","channel");
CREATE INDEX IF NOT EXISTS "DailyChannelSales_venue_date_idx" ON "DailyChannelSales"("venue","date");

CREATE TABLE IF NOT EXISTS "SquareCatalogItem" (
  "variationId" TEXT NOT NULL, "itemId" TEXT, "itemName" TEXT NOT NULL, "variationName" TEXT, "reportingCategory" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SquareCatalogItem_pkey" PRIMARY KEY ("variationId"));

CREATE TABLE IF NOT EXISTS "SquareTeamMember" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SquareTeamMember_pkey" PRIMARY KEY ("id"));

ALTER TABLE "DailySalesSummary" ADD COLUMN IF NOT EXISTS "surchargeIncGst" DECIMAL(12,2);
