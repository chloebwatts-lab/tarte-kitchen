-- Add the SupplierEmail table used by the invoice-scanner to build the
-- list of Gmail search addresses. The schema had the model but the
-- table was never actually created on the production DB.

CREATE TABLE IF NOT EXISTS "SupplierEmail" (
  "id"         TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "email"      TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierEmail_supplierId_email_key"
  ON "SupplierEmail"("supplierId", "email");

CREATE INDEX IF NOT EXISTS "SupplierEmail_email_idx"
  ON "SupplierEmail"("email");

ALTER TABLE "SupplierEmail"
  ADD CONSTRAINT "SupplierEmail_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
