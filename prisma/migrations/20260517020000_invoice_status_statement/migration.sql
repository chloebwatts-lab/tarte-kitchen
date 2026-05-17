-- Add STATEMENT status for invoice rows that are actually supplier monthly
-- statements (e.g. Provedores "MAY 2026"), not delivery invoices.
-- Statements get stored for audit but excluded from spend / variance sums.
ALTER TYPE "InvoiceStatus" ADD VALUE 'STATEMENT';
