-- Department ordering: each department fills its own order form, the
-- department head approves at close, and approved lines from every
-- department are regrouped by supplier into one PurchaseOrder each.

CREATE TYPE "OrderDept" AS ENUM ('KITCHEN', 'PASTRY', 'COFFEE_BAR', 'FRONT_OF_HOUSE');
CREATE TYPE "DeptOrderStatus" AS ENUM ('OPEN', 'APPROVED');

ALTER TABLE "ApprovedSupplierItem" ADD COLUMN "dept" "OrderDept";
CREATE INDEX "ApprovedSupplierItem_dept_idx" ON "ApprovedSupplierItem"("dept");

CREATE TABLE "DeptOrderOwner" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "dept" "OrderDept" NOT NULL,
    "ownerName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeptOrderOwner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeptOrderOwner_venue_dept_key" ON "DeptOrderOwner"("venue", "dept");

CREATE TABLE "DeptOrderRequest" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "dept" "OrderDept" NOT NULL,
    "requestDate" DATE NOT NULL,
    "status" "DeptOrderStatus" NOT NULL DEFAULT 'OPEN',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeptOrderRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeptOrderRequest_venue_dept_requestDate_key" ON "DeptOrderRequest"("venue", "dept", "requestDate");
CREATE INDEX "DeptOrderRequest_venue_requestDate_idx" ON "DeptOrderRequest"("venue", "requestDate");

CREATE TABLE "DeptOrderLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "approvedItemId" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "enteredBy" TEXT,
    "purchaseOrderId" TEXT,
    "orderedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeptOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeptOrderLine_requestId_approvedItemId_key" ON "DeptOrderLine"("requestId", "approvedItemId");
CREATE INDEX "DeptOrderLine_approvedItemId_idx" ON "DeptOrderLine"("approvedItemId");
CREATE INDEX "DeptOrderLine_purchaseOrderId_idx" ON "DeptOrderLine"("purchaseOrderId");

ALTER TABLE "DeptOrderLine" ADD CONSTRAINT "DeptOrderLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DeptOrderRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeptOrderLine" ADD CONSTRAINT "DeptOrderLine_approvedItemId_fkey" FOREIGN KEY ("approvedItemId") REFERENCES "ApprovedSupplierItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeptOrderLine" ADD CONSTRAINT "DeptOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
