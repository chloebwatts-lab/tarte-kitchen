-- CreateTable
CREATE TABLE "CoolingLog" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "itemName" TEXT NOT NULL,
    "batchSize" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "startTempC" DECIMAL(5,2),
    "twoHourTempC" DECIMAL(5,2),
    "twoHourAt" TIMESTAMP(3),
    "sixHourTempC" DECIMAL(5,2),
    "sixHourAt" TIMESTAMP(3),
    "fridgeTempC" DECIMAL(5,2),
    "staffInitials" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoolingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoolingLog_venue_startedAt_idx" ON "CoolingLog"("venue", "startedAt");
