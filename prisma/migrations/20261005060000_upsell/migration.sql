-- Upsell tracking + staff challenges on the Sales insights page.
CREATE TABLE IF NOT EXISTS "UpsellGroup" (
  "key" TEXT NOT NULL, "label" TEXT NOT NULL, "blurb" TEXT,
  "itemNames" TEXT[] DEFAULT ARRAY[]::TEXT[], "itemCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "modifierNames" TEXT[] DEFAULT ARRAY[]::TEXT[], "baseCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "channel" TEXT, "sortOrder" INTEGER NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "UpsellGroup_pkey" PRIMARY KEY ("key"));

CREATE TABLE IF NOT EXISTS "DailyStaffUpsell" (
  "id" TEXT NOT NULL, "date" DATE NOT NULL, "venue" "Venue" NOT NULL, "teamMemberId" TEXT NOT NULL, "staffName" TEXT NOT NULL,
  "groupKey" TEXT NOT NULL, "eligibleOrders" INTEGER NOT NULL, "ordersWith" INTEGER NOT NULL, "units" INTEGER NOT NULL,
  "salesIncGst" DECIMAL(12,2) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyStaffUpsell_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "DailyStaffUpsell_date_venue_teamMemberId_groupKey_key" ON "DailyStaffUpsell"("date","venue","teamMemberId","groupKey");
CREATE INDEX IF NOT EXISTS "DailyStaffUpsell_venue_date_groupKey_idx" ON "DailyStaffUpsell"("venue","date","groupKey");

CREATE TABLE IF NOT EXISTS "SalesChallenge" (
  "id" TEXT NOT NULL, "venue" "Venue" NOT NULL, "name" TEXT NOT NULL, "groupKey" TEXT NOT NULL, "metric" TEXT NOT NULL,
  "startDate" DATE NOT NULL, "endDate" DATE NOT NULL, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3), CONSTRAINT "SalesChallenge_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "SalesChallenge_venue_endDate_idx" ON "SalesChallenge"("venue","endDate");
