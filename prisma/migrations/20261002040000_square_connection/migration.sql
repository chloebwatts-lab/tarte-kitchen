-- Square Orders/Payments API connection (token pasted by Chloe, encrypted at
-- rest) + card takings per day so the processing fee rate can be checked.
CREATE TABLE IF NOT EXISTS "SquareConnection" (
  "id" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "merchantId" TEXT,
  "locations" JSONB,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  CONSTRAINT "SquareConnection_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "DailySalesSummary" ADD COLUMN IF NOT EXISTS "cardTakings" DECIMAL(12,2);
