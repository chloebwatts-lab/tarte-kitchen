-- Chloe, 12 Nov 2026: the wage % counts all revenue, including event
-- invoices from Xero. One row per venue and day, ex GST. New table only.
CREATE TABLE IF NOT EXISTS "DailyEventSales" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "venue" "Venue" NOT NULL,
    "exGst" DECIMAL(12,2) NOT NULL,
    "invoices" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyEventSales_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DailyEventSales_date_venue_key" ON "DailyEventSales"("date", "venue");
CREATE INDEX IF NOT EXISTS "DailyEventSales_venue_date_idx" ON "DailyEventSales"("venue", "date");
