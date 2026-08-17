-- Supplier credit notes were being ingested as ordinary invoices and
-- counted as positive spend. Add a dedicated status so they can be
-- identified; their amounts are stored negative so spend nets them off.
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'CREDIT_NOTE';
