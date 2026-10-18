-- Sales page (Shawna, 18 Oct 2026): a Sides reporting group needs each
-- order modifier's modifier list, and exact same-time-of-day comparisons
-- need one row per order with its open and paid times.

-- CreateTable
CREATE TABLE "SquareCatalogModifier" (
    "modifierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modifierListId" TEXT,
    "modifierListName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SquareCatalogModifier_pkey" PRIMARY KEY ("modifierId")
);

-- CreateTable
CREATE TABLE "SquareDayOrder" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "venue" "Venue" NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdMin" INTEGER NOT NULL,
    "paidMin" INTEGER,
    "paidIncGst" DECIMAL(12,2) NOT NULL,
    "table" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SquareDayOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SquareDayOrder_venue_date_orderId_key" ON "SquareDayOrder"("venue", "date", "orderId");

-- CreateIndex
CREATE INDEX "SquareDayOrder_venue_date_idx" ON "SquareDayOrder"("venue", "date");
