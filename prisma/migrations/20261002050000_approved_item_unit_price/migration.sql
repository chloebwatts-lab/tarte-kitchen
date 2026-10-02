-- Per-unit price on approved supplier items so the managers' "Where to
-- order it" lookup can compare suppliers like for like.
ALTER TABLE "ApprovedSupplierItem" ADD COLUMN IF NOT EXISTS "unitPrice" DECIMAL(10,4);
