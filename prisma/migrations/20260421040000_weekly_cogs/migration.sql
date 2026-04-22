-- WeeklyCogs + CogsUpload: Thursday xlsx ingest for per-venue COGS
-- actuals with category mix. Complements LabourWeekActual.cogsActual.

CREATE TABLE "CogsUpload" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "weekCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CogsUpload_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeeklyCogs" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "weekStartWed" DATE NOT NULL,
    "revenueExGst" DECIMAL(10,2),
    "totalCogs" DECIMAL(10,2) NOT NULL,
    "cogsPct" DECIMAL(5,2),
    "cogsTargetPct" DECIMAL(5,2),
    "cogsFood" DECIMAL(10,2),
    "cogsCoffee" DECIMAL(10,2),
    "cogsConsumables" DECIMAL(10,2),
    "cogsDrinks" DECIMAL(10,2),
    "cogsPackaging" DECIMAL(10,2),
    "source" TEXT NOT NULL DEFAULT 'XLSX',
    "uploadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyCogs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeeklyCogs_venue_weekStartWed_key" ON "WeeklyCogs"("venue", "weekStartWed");
CREATE INDEX "WeeklyCogs_weekStartWed_idx" ON "WeeklyCogs"("weekStartWed");

ALTER TABLE "WeeklyCogs" ADD CONSTRAINT "WeeklyCogs_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "CogsUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
