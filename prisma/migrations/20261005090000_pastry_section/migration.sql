-- Pastry section: reference photos per product, notes for Jess, and the
-- daily + afternoon prep lists (loose tick lists, not checklists).
-- Additive only.
ALTER TABLE "PastryProduct" ADD COLUMN IF NOT EXISTS "inRotation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PastryProduct" ADD COLUMN IF NOT EXISTS "note" TEXT;

CREATE TABLE IF NOT EXISTS "PastryProductPhoto" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "uploadedBy" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PastryProductPhoto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PastryProductPhoto_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PastryProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PastryProductPhoto_productId_idx" ON "PastryProductPhoto"("productId");

CREATE TABLE IF NOT EXISTS "PastryPrepTask" (
  "id" TEXT NOT NULL,
  "venue" "Venue" NOT NULL,
  "list" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "onlyDay" DATE,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PastryPrepTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PastryPrepTask_venue_list_isActive_idx" ON "PastryPrepTask"("venue", "list", "isActive");

CREATE TABLE IF NOT EXISTS "PastryPrepTick" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "doneBy" TEXT,
  "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PastryPrepTick_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PastryPrepTick_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PastryPrepTask"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PastryPrepTick_taskId_day_key" ON "PastryPrepTick"("taskId", "day");
CREATE INDEX IF NOT EXISTS "PastryPrepTick_day_idx" ON "PastryPrepTick"("day");

CREATE TABLE IF NOT EXISTS "PastryNote" (
  "id" TEXT NOT NULL,
  "venue" "Venue" NOT NULL,
  "text" TEXT NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "doneAt" TIMESTAMP(3),
  "doneBy" TEXT,
  CONSTRAINT "PastryNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PastryNote_venue_doneAt_idx" ON "PastryNote"("venue", "doneAt");
