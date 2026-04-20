-- Labour weekly model — Wed–Tue weeks, per-venue, upload + payroll import
-- Adds LabourShift.source, LabourWeekActual table, LabourUpload table.

ALTER TABLE "LabourShift"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'TIMESHEET';

CREATE INDEX "LabourShift_source_idx" ON "LabourShift"("source");

-- Upload audit log (one row per uploaded bookkeeper CSV)
CREATE TABLE "LabourUpload" (
  "id"         TEXT NOT NULL,
  "filename"   TEXT NOT NULL,
  "rawCsv"     TEXT NOT NULL,
  "weekCount"  INTEGER NOT NULL DEFAULT 0,
  "uploadedBy" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabourUpload_pkey" PRIMARY KEY ("id")
);

-- Weekly actuals keyed by (venue, Wed-start)
CREATE TABLE "LabourWeekActual" (
  "id"           TEXT NOT NULL,
  "venue"        "Venue" NOT NULL,
  "weekStartWed" DATE NOT NULL,
  "grossWages"   DECIMAL(10,2) NOT NULL,
  "superAmount"  DECIMAL(10,2) NOT NULL DEFAULT 0,
  "totalHours"   DECIMAL(8,2),
  "headcount"    INTEGER,
  "mForecast"    DECIMAL(10,2),
  "source"       TEXT NOT NULL DEFAULT 'UPLOAD',
  "notes"        TEXT,
  "uploadId"     TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LabourWeekActual_pkey" PRIMARY KEY ("id")
);

-- Manager sales forecast per venue per week (Wed–Tue)
CREATE TABLE "ManagerSalesForecast" (
  "id"           TEXT NOT NULL,
  "venue"        "Venue" NOT NULL,
  "weekStartWed" DATE NOT NULL,
  "amount"       DECIMAL(10,2) NOT NULL,
  "source"       TEXT NOT NULL DEFAULT 'MANUAL',
  "enteredBy"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManagerSalesForecast_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagerSalesForecast_venue_weekStartWed_key"
  ON "ManagerSalesForecast"("venue", "weekStartWed");
CREATE INDEX "ManagerSalesForecast_weekStartWed_idx"
  ON "ManagerSalesForecast"("weekStartWed");

CREATE UNIQUE INDEX "LabourWeekActual_venue_weekStartWed_key"
  ON "LabourWeekActual"("venue", "weekStartWed");
CREATE INDEX "LabourWeekActual_weekStartWed_idx"
  ON "LabourWeekActual"("weekStartWed");

ALTER TABLE "LabourWeekActual"
  ADD CONSTRAINT "LabourWeekActual_uploadId_fkey"
  FOREIGN KEY ("uploadId") REFERENCES "LabourUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
