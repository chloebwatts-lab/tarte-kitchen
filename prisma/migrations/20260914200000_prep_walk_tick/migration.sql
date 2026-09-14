-- CreateEnum
CREATE TYPE "PrepWalkStatus" AS ENUM ('DONE', 'SKIPPED');

-- CreateTable
CREATE TABLE "PrepWalkTick" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "forDate" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "status" "PrepWalkStatus" NOT NULL,
    "by" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepWalkTick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrepWalkTick_venue_forDate_idx" ON "PrepWalkTick"("venue", "forDate");

-- CreateIndex
CREATE UNIQUE INDEX "PrepWalkTick_venue_forDate_preparationId_key" ON "PrepWalkTick"("venue", "forDate", "preparationId");
