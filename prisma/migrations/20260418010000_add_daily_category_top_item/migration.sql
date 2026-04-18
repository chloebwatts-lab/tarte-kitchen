-- Top-N products per category per venue per day, mirroring the
-- Lightspeed EOD PDF's "Reporting Group Breakdown" section.

CREATE TABLE "DailyCategoryTopItem" (
  "id"           TEXT NOT NULL,
  "date"         DATE NOT NULL,
  "venue"        "Venue" NOT NULL,
  "categoryName" TEXT NOT NULL,
  "productName"  TEXT NOT NULL,
  "quantity"     INTEGER NOT NULL,
  "rank"         INTEGER NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyCategoryTopItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyCategoryTopItem_date_venue_categoryName_productName_key"
  ON "DailyCategoryTopItem"("date", "venue", "categoryName", "productName");

CREATE INDEX "DailyCategoryTopItem_date_venue_idx"
  ON "DailyCategoryTopItem"("date", "venue");

CREATE INDEX "DailyCategoryTopItem_categoryName_idx"
  ON "DailyCategoryTopItem"("categoryName");
