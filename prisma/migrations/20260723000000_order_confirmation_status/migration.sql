-- Pre-delivery order confirmations (Fresho "THIS IS NOT AN INVOICE" PDFs)
-- get their own status so they are excluded from spend and from the
-- content-dedupe candidate set.
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'ORDER_CONFIRMATION';

-- Per-run counters for the new document class and the sweep rescue path.
ALTER TABLE "InvoiceSyncRun" ADD COLUMN "orderConfirmations" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceSyncRun" ADD COLUMN "rescued" INTEGER NOT NULL DEFAULT 0;
