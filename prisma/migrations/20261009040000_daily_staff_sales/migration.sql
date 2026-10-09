-- Average sale leaderboard: paid orders + sales per staff member per channel per day.
CREATE TABLE IF NOT EXISTS "DailyStaffSales" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "venue" "Venue" NOT NULL,
  "teamMemberId" TEXT NOT NULL,
  "staffName" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "salesIncGst" DECIMAL(12,2) NOT NULL,
  "orders" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyStaffSales_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyStaffSales_date_venue_teamMemberId_channel_key" ON "DailyStaffSales"("date", "venue", "teamMemberId", "channel");
CREATE INDEX IF NOT EXISTS "DailyStaffSales_venue_date_idx" ON "DailyStaffSales"("venue", "date");
