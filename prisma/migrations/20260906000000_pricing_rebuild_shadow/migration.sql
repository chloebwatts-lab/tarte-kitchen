-- Pricing rebuild, shadow mode. Adds the supplier-product / observation /
-- product-alert tables that run alongside the v1 line flags and v2
-- PriceAlert without touching either. Also starts keeping the supplier
-- product code the extractor has always returned.

ALTER TABLE "InvoiceLineItem" ADD COLUMN "productCode" TEXT;

CREATE TYPE "PackSource" AS ENUM ('MEASURE', 'INGREDIENT', 'PARSED', 'CONFIRMED');
CREATE TYPE "PackConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "SupplierProductStatus" AS ENUM ('ACTIVE', 'NEEDS_PACK', 'REJECTED');
CREATE TYPE "ObservationStatus" AS ENUM ('VALID', 'SUSPECT', 'EXCLUDED');
CREATE TYPE "ProductAlertStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DISMISSED', 'AUTO_CLOSED');
CREATE TYPE "ResolvedBy" AS ENUM ('CHEF', 'ENGINE');

CREATE TABLE "SupplierProduct" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "productKey" TEXT NOT NULL,
  "productCode" TEXT,
  "description" TEXT NOT NULL,
  "billedUnit" TEXT,
  "ingredientId" TEXT,
  "packBaseUnits" DECIMAL(14,4),
  "packSource" "PackSource",
  "packConfidence" "PackConfidence",
  "packExplanation" TEXT,
  "packConfirmedBy" TEXT,
  "packConfirmedAt" TIMESTAMP(3),
  "status" "SupplierProductStatus" NOT NULL DEFAULT 'ACTIVE',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierProduct_supplierId_productKey_key" ON "SupplierProduct"("supplierId", "productKey");
CREATE INDEX "SupplierProduct_ingredientId_idx" ON "SupplierProduct"("ingredientId");
CREATE INDEX "SupplierProduct_status_idx" ON "SupplierProduct"("status");
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PriceObservation" (
  "id" TEXT NOT NULL,
  "supplierProductId" TEXT NOT NULL,
  "invoiceLineItemId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "ingredientId" TEXT,
  "observedAt" DATE NOT NULL,
  "venue" "Venue",
  "billedQty" DECIMAL(12,3),
  "billedUnitPrice" DECIMAL(12,4),
  "packBaseUnits" DECIMAL(14,4),
  "pricePerBaseUnit" DECIMAL(14,8),
  "baseUnitsDelivered" DECIMAL(14,3),
  "status" "ObservationStatus" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PriceObservation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PriceObservation_invoiceLineItemId_key" ON "PriceObservation"("invoiceLineItemId");
CREATE INDEX "PriceObservation_supplierProductId_observedAt_idx" ON "PriceObservation"("supplierProductId", "observedAt");
CREATE INDEX "PriceObservation_ingredientId_observedAt_idx" ON "PriceObservation"("ingredientId", "observedAt");
CREATE INDEX "PriceObservation_status_idx" ON "PriceObservation"("status");
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_supplierProductId_fkey" FOREIGN KEY ("supplierProductId") REFERENCES "SupplierProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_invoiceLineItemId_fkey" FOREIGN KEY ("invoiceLineItemId") REFERENCES "InvoiceLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProductPriceAlert" (
  "id" TEXT NOT NULL,
  "supplierProductId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "stream" "PriceAlertStream" NOT NULL,
  "latestObservationId" TEXT NOT NULL,
  "currentPerBase" DECIMAL(14,8) NOT NULL,
  "priorPerBase" DECIMAL(14,8) NOT NULL,
  "priorMedianPerBase" DECIMAL(14,8),
  "changePct" DECIMAL(8,2) NOT NULL,
  "weeklyImpactDollars" DECIMAL(10,2),
  "status" "ProductAlertStatus" NOT NULL DEFAULT 'OPEN',
  "resolvedBy" "ResolvedBy",
  "resolvedAt" TIMESTAMP(3),
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductPriceAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductPriceAlert_status_stream_idx" ON "ProductPriceAlert"("status", "stream");
CREATE INDEX "ProductPriceAlert_ingredientId_idx" ON "ProductPriceAlert"("ingredientId");
CREATE INDEX "ProductPriceAlert_supplierProductId_status_idx" ON "ProductPriceAlert"("supplierProductId", "status");
-- One OPEN alert per product, race-proof (same pattern as PriceAlert).
CREATE UNIQUE INDEX "ProductPriceAlert_open_product_unique" ON "ProductPriceAlert"("supplierProductId") WHERE status = 'OPEN';
ALTER TABLE "ProductPriceAlert" ADD CONSTRAINT "ProductPriceAlert_supplierProductId_fkey" FOREIGN KEY ("supplierProductId") REFERENCES "SupplierProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductPriceAlert" ADD CONSTRAINT "ProductPriceAlert_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
