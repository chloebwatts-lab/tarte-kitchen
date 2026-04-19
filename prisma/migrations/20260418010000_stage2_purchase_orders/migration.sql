-- Stage 2 · #1: Purchase orders
-- Adds the PurchaseOrder / PurchaseOrderLine pair + supplier delivery-day
-- metadata that drives the PO suggestion engine.

CREATE TYPE "PurchaseOrderStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED'
);

-- Supplier metadata
ALTER TABLE "Supplier"
  ADD COLUMN "deliveryDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "orderCutoffHour" INTEGER;

-- Purchase orders
CREATE TABLE "PurchaseOrder" (
  "id"           TEXT NOT NULL,
  "supplierId"   TEXT NOT NULL,
  "venue"        "Venue" NOT NULL,
  "status"       "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "orderDate"    DATE NOT NULL,
  "expectedDate" DATE,
  "subtotal"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "notes"        TEXT,
  "submittedBy"  TEXT,
  "submittedAt"  TIMESTAMP(3),
  "emailSubject" TEXT,
  "emailTo"      TEXT,
  "emailBody"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchaseOrder_supplierId_status_idx"
  ON "PurchaseOrder"("supplierId", "status");
CREATE INDEX "PurchaseOrder_venue_orderDate_idx"
  ON "PurchaseOrder"("venue", "orderDate");
ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PurchaseOrderLine" (
  "id"           TEXT NOT NULL,
  "orderId"      TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "quantity"     DECIMAL(12,3) NOT NULL,
  "unit"         TEXT NOT NULL,
  "unitPrice"    DECIMAL(12,4) NOT NULL,
  "lineTotal"    DECIMAL(12,2) NOT NULL,
  "receivedQty"  DECIMAL(12,3),
  "note"         TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchaseOrderLine_ingredientId_idx"
  ON "PurchaseOrderLine"("ingredientId");
CREATE INDEX "PurchaseOrderLine_orderId_idx"
  ON "PurchaseOrderLine"("orderId");
ALTER TABLE "PurchaseOrderLine"
  ADD CONSTRAINT "PurchaseOrderLine_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine"
  ADD CONSTRAINT "PurchaseOrderLine_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
