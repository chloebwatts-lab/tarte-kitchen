-- Approved supplier order forms. One row per item on a supplier's form
-- (Bidfood / Provedores / Fermex etc). Source of truth for what the kitchen
-- is meant to order from whom and at what price, used by the supplier
-- variance panel to flag misorders and price creep.

CREATE TABLE "ApprovedSupplierItem" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "packSize" TEXT,
    "packPrice" DECIMAL(10,2) NOT NULL,
    "unit" TEXT,
    "category" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "ingredientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovedSupplierItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApprovedSupplierItem_supplierId_name_key" ON "ApprovedSupplierItem"("supplierId", "name");
CREATE INDEX "ApprovedSupplierItem_supplierId_idx" ON "ApprovedSupplierItem"("supplierId");
CREATE INDEX "ApprovedSupplierItem_ingredientId_idx" ON "ApprovedSupplierItem"("ingredientId");

ALTER TABLE "ApprovedSupplierItem" ADD CONSTRAINT "ApprovedSupplierItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovedSupplierItem" ADD CONSTRAINT "ApprovedSupplierItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
