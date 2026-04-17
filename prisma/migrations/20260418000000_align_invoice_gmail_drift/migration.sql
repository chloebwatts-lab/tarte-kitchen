-- Align Invoice / InvoiceLineItem / GmailConnection / SupplierItemMapping
-- with the Prisma schema.
--
-- The production DB ran ahead of the repo's migrations with ad-hoc manual
-- changes. When the schema was later edited to canonical field names, the DB
-- was left behind. Every table touched here had 0 rows at alignment time, so
-- we rename/drop columns without data salvage.

-- ============================================================
-- GmailConnection  (column renames + add scanFrequency)
-- ============================================================
ALTER TABLE "GmailConnection" RENAME COLUMN "tokenExpiresAt" TO "tokenExpiry";
ALTER TABLE "GmailConnection" RENAME COLUMN "emailAddress"   TO "email";
ALTER TABLE "GmailConnection" RENAME COLUMN "lastCheckedAt"  TO "lastScanAt";
ALTER TABLE "GmailConnection" RENAME COLUMN "connectedAt"    TO "createdAt";

ALTER TABLE "GmailConnection"
  ADD COLUMN IF NOT EXISTS "scanFrequency" INTEGER NOT NULL DEFAULT 60;

-- ============================================================
-- Invoice  (rename + add columns, 0 rows)
-- ============================================================
ALTER TABLE "Invoice" RENAME COLUMN "totalAmount"    TO "total";
ALTER TABLE "Invoice" RENAME COLUMN "pdfPath"        TO "pdfUrl";
ALTER TABLE "Invoice" RENAME COLUMN "rawExtraction"  TO "extractedData";

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "gmailThreadId"   TEXT,
  ADD COLUMN IF NOT EXISTS "supplierName"    TEXT,
  ADD COLUMN IF NOT EXISTS "venue"           "Venue",
  ADD COLUMN IF NOT EXISTS "dueDate"         DATE,
  ADD COLUMN IF NOT EXISTS "pdfFilename"     TEXT,
  ADD COLUMN IF NOT EXISTS "rawEmailSubject" TEXT,
  ADD COLUMN IF NOT EXISTS "rawEmailFrom"    TEXT,
  ADD COLUMN IF NOT EXISTS "rawEmailDate"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedBy"      TEXT;

-- supplierName is NOT NULL in the schema; backfill with empty string for
-- any existing 0-row table (the UPDATE is a no-op today but keeps the
-- migration safe if rows appeared between inspection and execution).
UPDATE "Invoice" SET "supplierName" = COALESCE("supplierName", '');
ALTER TABLE "Invoice" ALTER COLUMN "supplierName" SET NOT NULL;

-- Ensure indexes the schema expects exist
CREATE INDEX IF NOT EXISTS "Invoice_supplierName_idx" ON "Invoice"("supplierName");
CREATE INDEX IF NOT EXISTS "Invoice_venue_idx"        ON "Invoice"("venue");

-- ============================================================
-- InvoiceLineItem  (field-name + semantics alignment, 0 rows)
-- ============================================================
-- Schema drops `productCode`, `gst`, `priceChangeAmount`, `priceChangePercent`
-- and replaces tri-state `acknowledged` (bool) with `priceApproved` (bool?)
-- plus adds match confidence / current-price / name / sortOrder / updatedAt.
ALTER TABLE "InvoiceLineItem"
  DROP COLUMN IF EXISTS "productCode",
  DROP COLUMN IF EXISTS "gst",
  DROP COLUMN IF EXISTS "priceChangeAmount",
  DROP COLUMN IF EXISTS "priceChangePercent",
  DROP COLUMN IF EXISTS "acknowledged",
  DROP COLUMN IF EXISTS "previousPrice";

ALTER TABLE "InvoiceLineItem"
  ADD COLUMN IF NOT EXISTS "matchConfidence" TEXT,
  ADD COLUMN IF NOT EXISTS "matchedName"     TEXT,
  ADD COLUMN IF NOT EXISTS "currentPrice"    DECIMAL(12, 4),
  ADD COLUMN IF NOT EXISTS "priceApproved"   BOOLEAN,
  ADD COLUMN IF NOT EXISTS "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ============================================================
-- SupplierItemMapping  (rename table from SupplierIngredientMapping + restructure)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='SupplierIngredientMapping'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='SupplierItemMapping'
  ) THEN
    ALTER TABLE "SupplierIngredientMapping" RENAME TO "SupplierItemMapping";
    ALTER TABLE "SupplierItemMapping" RENAME COLUMN "supplierProductName" TO "invoiceDescription";
    -- Drop the product code column (it's not on the schema anymore)
    ALTER TABLE "SupplierItemMapping" DROP COLUMN IF EXISTS "supplierProductCode";
    ALTER TABLE "SupplierItemMapping"
      ADD COLUMN IF NOT EXISTS "invoiceUnit"      TEXT,
      ADD COLUMN IF NOT EXISTS "conversionFactor" DECIMAL(12, 6),
      ADD COLUMN IF NOT EXISTS "lastUsed"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    -- Rename the primary-key / unique constraints to match the new table name
    ALTER INDEX IF EXISTS "SupplierIngredientMapping_pkey" RENAME TO "SupplierItemMapping_pkey";
  END IF;
END $$;

-- Ensure the unique and FK indexes exist on SupplierItemMapping
CREATE UNIQUE INDEX IF NOT EXISTS
  "SupplierItemMapping_supplierId_invoiceDescription_key"
  ON "SupplierItemMapping"("supplierId", "invoiceDescription");

CREATE INDEX IF NOT EXISTS
  "SupplierItemMapping_ingredientId_idx"
  ON "SupplierItemMapping"("ingredientId");
