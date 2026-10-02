-- Square went live at Currumbin on 1 Oct 2026. Daily sales now arrive as
-- Square "daily sales summary" emails (one per location) instead of the
-- Lightspeed EOD PDF. Fees + orders come with them; categories get their own
-- table because Square reports category totals, not top products.
ALTER TABLE "DailySalesSummary" ADD COLUMN IF NOT EXISTS "fees" DECIMAL(12,2);
ALTER TABLE "DailySalesSummary" ADD COLUMN IF NOT EXISTS "totalOrders" INTEGER;

CREATE TABLE IF NOT EXISTS "SquareReportImport" (
  "id" TEXT NOT NULL,
  "gmailMessageId" TEXT NOT NULL,
  "reportDate" DATE NOT NULL,
  "venue" "Venue" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SquareReportImport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SquareReportImport_gmailMessageId_key" ON "SquareReportImport"("gmailMessageId");
CREATE INDEX IF NOT EXISTS "SquareReportImport_reportDate_venue_idx" ON "SquareReportImport"("reportDate", "venue");

CREATE TABLE IF NOT EXISTS "DailyCategorySales" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "venue" "Venue" NOT NULL,
  "categoryName" TEXT NOT NULL,
  "itemsSold" DECIMAL(10,2) NOT NULL,
  "netSalesExGst" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyCategorySales_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyCategorySales_date_venue_categoryName_key" ON "DailyCategorySales"("date", "venue", "categoryName");
CREATE INDEX IF NOT EXISTS "DailyCategorySales_date_venue_idx" ON "DailyCategorySales"("date", "venue");
