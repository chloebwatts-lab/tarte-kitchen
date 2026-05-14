-- Allow users to reject incorrect auto-mappings (e.g. "Milk Bun 100g"
-- from Pixel Bread getting auto-mapped to "Milk Bun (BreadTop)" — a
-- different product). The matcher skips ignored mappings, so the next
-- invoice with the same description re-runs through the cascade.

ALTER TABLE "SupplierItemMapping"
  ADD COLUMN "ignored" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ignoredAt" TIMESTAMP(3),
  ADD COLUMN "ignoredBy" TEXT;

CREATE INDEX "SupplierItemMapping_supplierId_ignored_idx"
  ON "SupplierItemMapping"("supplierId", "ignored");
