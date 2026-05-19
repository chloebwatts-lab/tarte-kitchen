-- Make PurchaseOrderLine.ingredientId optional + add description for
-- ordering ApprovedSupplierItem rows that aren't linked to an Ingredient.

ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "ingredientId" DROP NOT NULL;

ALTER TABLE "PurchaseOrderLine" DROP CONSTRAINT IF EXISTS "PurchaseOrderLine_ingredientId_fkey";
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderLine" ADD COLUMN "description" TEXT;
