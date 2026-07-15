-- Phase 5: Price alert v2 — decoupled from invoice line flag

CREATE TYPE "PriceAlertStream" AS ENUM ('PRODUCE', 'STABLE');
CREATE TYPE "PriceAlertStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DISMISSED');

CREATE TABLE "PriceAlert" (
  "id"                 TEXT NOT NULL,
  "ingredientId"       TEXT NOT NULL,
  "canonicalName"      TEXT NOT NULL,
  "stream"             "PriceAlertStream" NOT NULL,
  "currentPrice"       DECIMAL(12,4) NOT NULL,
  "currentUnit"        TEXT NOT NULL,
  "priorPrice"         DECIMAL(12,4) NOT NULL,
  "priorPeriodMedian"  DECIMAL(12,4),
  "changePct"          DECIMAL(8,2) NOT NULL,
  "weeklyImpactDollars" DECIMAL(10,2),
  "status"             "PriceAlertStatus" NOT NULL DEFAULT 'OPEN',
  "supplierName"       TEXT,
  "firstSeenAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"         TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceAlert_status_stream_idx" ON "PriceAlert"("status", "stream");
CREATE INDEX "PriceAlert_canonicalName_idx" ON "PriceAlert"("canonicalName");
CREATE INDEX "PriceAlert_ingredientId_idx" ON "PriceAlert"("ingredientId");
CREATE UNIQUE INDEX "PriceAlert_ingredientId_status_key"
  ON "PriceAlert"("ingredientId") WHERE "status" = 'OPEN';

ALTER TABLE "PriceAlert"
  ADD CONSTRAINT "PriceAlert_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
