-- CreateTable
CREATE TABLE "WeeklyDigest" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "reviewAvgRating" DECIMAL(3,2),
    "salesTotal" DECIMAL(12,2),
    "salesWowPct" DECIMAL(6,2),
    "cogsAvgPct" DECIMAL(5,2),
    "labourAvgPct" DECIMAL(5,2),
    "wastageTotal" DECIMAL(10,2),
    "priceSpikeCount" INTEGER NOT NULL DEFAULT 0,
    "body" TEXT NOT NULL,
    "sourceJson" JSONB,
    "emailedTo" TEXT,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyDigest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyDigest_weekStart_key" ON "WeeklyDigest"("weekStart");
