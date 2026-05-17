-- Add DUPLICATE status for invoice rows that are content-level duplicates
-- of an already-ingested invoice (different gmailMessageId, same supplier +
-- invoice number — typically a forwarded email).
ALTER TYPE "InvoiceStatus" ADD VALUE 'DUPLICATE';
