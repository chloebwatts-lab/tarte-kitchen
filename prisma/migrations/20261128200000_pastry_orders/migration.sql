-- Pastry Orders (Shawna, 28 Nov 2026). Additive only: three new tables.
CREATE TABLE "pastry_orders" (
    "id" TEXT NOT NULL,
    "order" TEXT NOT NULL,
    "customer" TEXT NOT NULL DEFAULT '',
    "venue" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL DEFAULT '',
    "time" TEXT NOT NULL DEFAULT '',
    "item" TEXT NOT NULL DEFAULT '',
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contact" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "flag" TEXT NOT NULL DEFAULT '',
    "flagKind" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL DEFAULT '',
    "payment" TEXT NOT NULL DEFAULT '',
    "takenBy" TEXT NOT NULL DEFAULT '',
    "staffStatus" TEXT NOT NULL DEFAULT '',
    "staffStatusBy" TEXT NOT NULL DEFAULT '',
    "staffStatusAt" TEXT NOT NULL DEFAULT '',
    "staffStatusNote" TEXT NOT NULL DEFAULT '',
    "changeNote" TEXT NOT NULL DEFAULT '',
    "pickedUp" BOOLEAN NOT NULL DEFAULT false,
    "pickedUpBy" TEXT NOT NULL DEFAULT '',
    "pickedUpAt" TEXT NOT NULL DEFAULT '',
    "flagResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT NOT NULL DEFAULT '',
    "resolvedAt" TEXT NOT NULL DEFAULT '',
    "resolvedNote" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastry_orders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pastry_orders_date_idx" ON "pastry_orders"("date");
CREATE INDEX "pastry_orders_order_idx" ON "pastry_orders"("order");

CREATE TABLE "pastry_log" (
    "id" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    "order" TEXT NOT NULL DEFAULT '',
    "customer" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "by" TEXT NOT NULL DEFAULT '',
    "byId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastry_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pastry_scan" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pastry_scan_pkey" PRIMARY KEY ("id")
);
