-- Uber Eats: pasted Manager session + one row per venue-day of Uber sales
-- (menu value inc GST, before commission). Never part of the venue total.
CREATE TABLE IF NOT EXISTS "UberEatsConnection" (
  "id" TEXT NOT NULL,
  "cookie" TEXT NOT NULL,
  "stores" JSONB,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  CONSTRAINT "UberEatsConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DailyUberSales" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "venue" "Venue" NOT NULL,
  "salesIncGst" DECIMAL(12,2) NOT NULL,
  "orders" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyUberSales_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyUberSales_date_venue_key" ON "DailyUberSales"("date", "venue");
CREATE INDEX IF NOT EXISTS "DailyUberSales_venue_date_idx" ON "DailyUberSales"("venue", "date");
