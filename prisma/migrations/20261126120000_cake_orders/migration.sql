-- Cake orders (Shawna, 26 Nov 2026). Additive only: three new tables, two enums.
CREATE TYPE "CakeOrderSource" AS ENUM ('WEBSITE', 'STAFF');
CREATE TYPE "CakeOrderStatus" AS ENUM ('NEW', 'SEEN', 'READY', 'COLLECTED', 'CANCELLED');

CREATE TABLE "CakeOrder" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "pickupDate" DATE,
    "pickupTime" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "product" TEXT NOT NULL,
    "details" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "message" TEXT,
    "dietary" TEXT,
    "notes" TEXT,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "source" "CakeOrderSource" NOT NULL DEFAULT 'STAFF',
    "orderRef" TEXT,
    "sourceRef" TEXT,
    "checkNote" TEXT,
    "status" "CakeOrderStatus" NOT NULL DEFAULT 'NEW',
    "statusBy" TEXT,
    "statusAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CakeOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CakeOrder_sourceRef_key" ON "CakeOrder"("sourceRef");
CREATE INDEX "CakeOrder_pickupDate_idx" ON "CakeOrder"("pickupDate");
CREATE INDEX "CakeOrder_status_pickupDate_idx" ON "CakeOrder"("status", "pickupDate");
CREATE INDEX "CakeOrder_orderRef_idx" ON "CakeOrder"("orderRef");

CREATE TABLE "CakeOrderImport" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "orderRef" TEXT,
    "outcome" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CakeOrderImport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CakeOrderImport_gmailMessageId_key" ON "CakeOrderImport"("gmailMessageId");

CREATE TABLE "CakePushSub" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "label" TEXT,
    "person" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CakePushSub_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CakePushSub_endpoint_key" ON "CakePushSub"("endpoint");
