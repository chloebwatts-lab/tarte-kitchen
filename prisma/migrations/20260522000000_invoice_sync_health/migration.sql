-- Resilient invoice ingestion. Two new tables:
--   InvoiceSyncRun        — audit log of every check-invoices run, so
--                            "ingestion silently stopped working for 4
--                            days" can't happen again unnoticed.
--   UnknownInvoiceSender  — PDFs from senders we don't recognise, kept
--                            in a review queue instead of vanishing.

CREATE TABLE "InvoiceSyncRun" (
  "id"               TEXT NOT NULL,
  "startedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"       TIMESTAMP(3),
  "mode"             TEXT NOT NULL,
  "messagesFound"    INTEGER NOT NULL DEFAULT 0,
  "invoicesIngested" INTEGER NOT NULL DEFAULT 0,
  "duplicates"       INTEGER NOT NULL DEFAULT 0,
  "statements"       INTEGER NOT NULL DEFAULT 0,
  "errors"           INTEGER NOT NULL DEFAULT 0,
  "errorSummary"     TEXT,
  "healthy"          BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "InvoiceSyncRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvoiceSyncRun_startedAt_idx" ON "InvoiceSyncRun"("startedAt");
CREATE INDEX "InvoiceSyncRun_mode_startedAt_idx" ON "InvoiceSyncRun"("mode", "startedAt");

CREATE TABLE "UnknownInvoiceSender" (
  "id"             TEXT NOT NULL,
  "senderEmail"    TEXT NOT NULL,
  "senderName"     TEXT,
  "subject"        TEXT,
  "gmailMessageId" TEXT NOT NULL,
  "firstSeenAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurrences"    INTEGER NOT NULL DEFAULT 1,
  "resolved"       BOOLEAN NOT NULL DEFAULT false,
  "resolvedNote"   TEXT,
  "resolvedAt"     TIMESTAMP(3),
  CONSTRAINT "UnknownInvoiceSender_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UnknownInvoiceSender_gmailMessageId_key" ON "UnknownInvoiceSender"("gmailMessageId");
CREATE INDEX "UnknownInvoiceSender_resolved_senderEmail_idx" ON "UnknownInvoiceSender"("resolved", "senderEmail");
