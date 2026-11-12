-- Kitchen to Xero DRAFT supplier bills (12 Nov 2026): push record on each
-- invoice and a log of runs. Additive only.
ALTER TABLE "Invoice" ADD COLUMN "xeroInvoiceId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "xeroOrg" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "xeroPushedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "xeroPushError" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "xeroAttachedAt" TIMESTAMP(3);

CREATE TABLE "XeroBillRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "live" BOOLEAN NOT NULL,
    "cutoff" TEXT NOT NULL,
    "capPerOrg" INTEGER NOT NULL,
    "summary" JSONB,
    "error" TEXT,
    CONSTRAINT "XeroBillRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "XeroBillRun_startedAt_idx" ON "XeroBillRun"("startedAt");
