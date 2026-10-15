-- Jose (WhatsApp, 15 Oct 2026): "Order Requests" on the prep page, and a
-- "Still to make" tab on the morning run for prep an earlier night left
-- unmade, with a way to bring it onto today's list or mark it not needed.

-- AlterTable
ALTER TABLE "RestockLine" ADD COLUMN     "carriedAt" TIMESTAMP(3),
ADD COLUMN     "carriedBy" TEXT,
ADD COLUMN     "droppedAt" TIMESTAMP(3),
ADD COLUMN     "droppedBy" TEXT;

-- CreateTable
CREATE TABLE "PrepOrderRequest" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "text" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),
    "doneBy" TEXT,

    CONSTRAINT "PrepOrderRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrepOrderRequest_venue_doneAt_idx" ON "PrepOrderRequest"("venue", "doneAt");
