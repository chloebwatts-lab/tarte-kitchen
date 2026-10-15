-- Chloe (15 Oct 2026): an order request picks the product from the approved
-- supplier catalogue, with free text only for things not on the order list.

-- AlterTable
ALTER TABLE "PrepOrderRequest" ADD COLUMN     "approvedItemId" TEXT,
ADD COLUMN     "note" TEXT;

-- CreateIndex
CREATE INDEX "PrepOrderRequest_approvedItemId_idx" ON "PrepOrderRequest"("approvedItemId");

-- AddForeignKey
ALTER TABLE "PrepOrderRequest" ADD CONSTRAINT "PrepOrderRequest_approvedItemId_fkey" FOREIGN KEY ("approvedItemId") REFERENCES "ApprovedSupplierItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
