-- Split CURRUMBIN into BEACH_HOUSE + TEA_GARDEN, add SalesSource enum,
-- add LightspeedReportImport, add source columns to DailySales(Summary).
--
-- Legacy CURRUMBIN data is remapped to BEACH_HOUSE; Tea Garden is a brand-new
-- venue with no historical rows.

-- 1. New Venue enum (swap strategy — cannot ADD VALUE and use it in the same txn)
CREATE TYPE "Venue_new" AS ENUM ('BURLEIGH', 'BEACH_HOUSE', 'TEA_GARDEN', 'BOTH');

-- 2. Drop column default that references the old enum type
ALTER TABLE "Dish" ALTER COLUMN "venue" DROP DEFAULT;

-- 3. Re-type every venue column, remapping CURRUMBIN → BEACH_HOUSE
ALTER TABLE "Dish"
  ALTER COLUMN "venue" TYPE "Venue_new"
  USING (CASE "venue"::text
           WHEN 'CURRUMBIN' THEN 'BEACH_HOUSE'::"Venue_new"
           ELSE "venue"::text::"Venue_new"
         END);

ALTER TABLE "DailySales"
  ALTER COLUMN "venue" TYPE "Venue_new"
  USING (CASE "venue"::text
           WHEN 'CURRUMBIN' THEN 'BEACH_HOUSE'::"Venue_new"
           ELSE "venue"::text::"Venue_new"
         END);

ALTER TABLE "DailySalesSummary"
  ALTER COLUMN "venue" TYPE "Venue_new"
  USING (CASE "venue"::text
           WHEN 'CURRUMBIN' THEN 'BEACH_HOUSE'::"Venue_new"
           ELSE "venue"::text::"Venue_new"
         END);

ALTER TABLE "WasteEntry"
  ALTER COLUMN "venue" TYPE "Venue_new"
  USING (CASE "venue"::text
           WHEN 'CURRUMBIN' THEN 'BEACH_HOUSE'::"Venue_new"
           ELSE "venue"::text::"Venue_new"
         END);

ALTER TABLE "TheoreticalUsage"
  ALTER COLUMN "venue" TYPE "Venue_new"
  USING (CASE "venue"::text
           WHEN 'CURRUMBIN' THEN 'BEACH_HOUSE'::"Venue_new"
           ELSE "venue"::text::"Venue_new"
         END);

ALTER TABLE "Invoice"
  ALTER COLUMN "venue" TYPE "Venue_new"
  USING (CASE "venue"::text
           WHEN 'CURRUMBIN' THEN 'BEACH_HOUSE'::"Venue_new"
           ELSE "venue"::text::"Venue_new"
         END);

-- 4. Swap type names and restore the default
DROP TYPE "Venue";
ALTER TYPE "Venue_new" RENAME TO "Venue";
ALTER TABLE "Dish" ALTER COLUMN "venue" SET DEFAULT 'BOTH';

-- 5. Rewrite embedded JSON in LightspeedConnection.businessLocations
UPDATE "LightspeedConnection"
SET "businessLocations" = replace("businessLocations"::text, '"CURRUMBIN"', '"BEACH_HOUSE"')::jsonb
WHERE "businessLocations"::text LIKE '%CURRUMBIN%';

-- 6. New SalesSource enum
CREATE TYPE "SalesSource" AS ENUM ('API', 'EMAIL');

-- 7. Add source column to DailySales and DailySalesSummary
ALTER TABLE "DailySales"
  ADD COLUMN "source" "SalesSource" NOT NULL DEFAULT 'API';

ALTER TABLE "DailySalesSummary"
  ADD COLUMN "source" "SalesSource" NOT NULL DEFAULT 'API';

-- 8. LightspeedReportImport (idempotency table)
CREATE TABLE "LightspeedReportImport" (
  "id"             TEXT      NOT NULL,
  "gmailMessageId" TEXT      NOT NULL,
  "reportDate"     DATE      NOT NULL,
  "venue"          "Venue"   NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LightspeedReportImport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LightspeedReportImport_gmailMessageId_key"
  ON "LightspeedReportImport"("gmailMessageId");

CREATE INDEX "LightspeedReportImport_reportDate_venue_idx"
  ON "LightspeedReportImport"("reportDate", "venue");
