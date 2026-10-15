-- Chloe (15 Oct 2026): order requests for pastry too, each department on its
-- own list, and a quantity on a request.

-- AlterTable
ALTER TABLE "PrepOrderRequest" ADD COLUMN     "dept" "OrderDept" NOT NULL DEFAULT 'KITCHEN',
ADD COLUMN     "qty" DECIMAL(10,2);

-- DropIndex
DROP INDEX "PrepOrderRequest_venue_doneAt_idx";

-- CreateIndex
CREATE INDEX "PrepOrderRequest_venue_dept_doneAt_idx" ON "PrepOrderRequest"("venue", "dept", "doneAt");
