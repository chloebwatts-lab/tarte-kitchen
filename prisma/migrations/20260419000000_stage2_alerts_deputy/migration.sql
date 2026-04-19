-- Stage 2 · #2 + #3 + #4:
--   - Checklist alerting (dueByHour + alertEmails + ChecklistAlert table)
--   - Deputy labour integration (DeputyConnection + LabourShift)

-- ---------- CHECKLIST ALERTING ----------
ALTER TABLE "ChecklistTemplate"
  ADD COLUMN "dueByHour"   INTEGER,
  ADD COLUMN "alertEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "ChecklistAlert" (
  "id"             TEXT NOT NULL,
  "templateId"     TEXT NOT NULL,
  "venue"          "Venue" NOT NULL,
  "runDate"        DATE NOT NULL,
  "completedItems" INTEGER NOT NULL,
  "totalItems"     INTEGER NOT NULL,
  "emailedTo"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "emailedAt"      TIMESTAMP(3),
  "resolvedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChecklistAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChecklistAlert_templateId_venue_runDate_key"
  ON "ChecklistAlert"("templateId", "venue", "runDate");
CREATE INDEX "ChecklistAlert_resolvedAt_idx" ON "ChecklistAlert"("resolvedAt");
ALTER TABLE "ChecklistAlert"
  ADD CONSTRAINT "ChecklistAlert_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------- DEPUTY INTEGRATION ----------
CREATE TABLE "DeputyConnection" (
  "id"             TEXT NOT NULL,
  "install"        TEXT NOT NULL,
  "region"         TEXT NOT NULL DEFAULT 'au',
  "accessToken"    TEXT NOT NULL,
  "refreshToken"   TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "locations"      JSONB,
  "connectedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSyncedAt"   TIMESTAMP(3),
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeputyConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LabourShift" (
  "id"           TEXT NOT NULL,
  "deputyId"     TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "employeeId"   TEXT,
  "venue"        "Venue" NOT NULL,
  "shiftStart"   TIMESTAMP(3) NOT NULL,
  "shiftEnd"     TIMESTAMP(3) NOT NULL,
  "hours"        DECIMAL(6,2) NOT NULL,
  "cost"         DECIMAL(10,2) NOT NULL,
  "payRate"      DECIMAL(8,2),
  "area"         TEXT,
  "approved"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LabourShift_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LabourShift_deputyId_key" ON "LabourShift"("deputyId");
CREATE INDEX "LabourShift_venue_shiftStart_idx" ON "LabourShift"("venue", "shiftStart");
CREATE INDEX "LabourShift_shiftStart_idx" ON "LabourShift"("shiftStart");
