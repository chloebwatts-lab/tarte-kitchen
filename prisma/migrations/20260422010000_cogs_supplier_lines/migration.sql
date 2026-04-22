-- Per-supplier spend per (venue, week) from the Thursday COGS xlsx.
-- Populated alongside WeeklyCogs by commitCogsXlsx.

CREATE TABLE "CogsSupplierLine" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "weekStartWed" DATE NOT NULL,
    "supplier" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "uploadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CogsSupplierLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CogsSupplierLine_venue_weekStartWed_supplier_key" ON "CogsSupplierLine"("venue", "weekStartWed", "supplier");
CREATE INDEX "CogsSupplierLine_venue_weekStartWed_idx" ON "CogsSupplierLine"("venue", "weekStartWed");
CREATE INDEX "CogsSupplierLine_supplier_idx" ON "CogsSupplierLine"("supplier");

ALTER TABLE "CogsSupplierLine" ADD CONSTRAINT "CogsSupplierLine_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "CogsUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
