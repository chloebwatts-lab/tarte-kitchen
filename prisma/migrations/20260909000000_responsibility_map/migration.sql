-- CreateEnum
CREATE TYPE "HandoverStage" AS ENUM ('WATCHING', 'DOING_WITH', 'DOING_TELLING', 'OWNS');

-- CreateTable
CREATE TABLE "ResponsibilityArea" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerName" TEXT,
    "backupName" TEXT,
    "youDecide" TEXT,
    "youAsk" TEXT,
    "toTakeThisOn" TEXT,
    "bookletRef" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResponsibilityArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponsibilityHandover" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "stage" "HandoverStage" NOT NULL DEFAULT 'WATCHING',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResponsibilityHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResponsibilityArea_venue_isActive_idx" ON "ResponsibilityArea"("venue", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ResponsibilityArea_venue_name_key" ON "ResponsibilityArea"("venue", "name");

-- CreateIndex
CREATE INDEX "ResponsibilityHandover_areaId_stage_idx" ON "ResponsibilityHandover"("areaId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "ResponsibilityHandover_areaId_personName_key" ON "ResponsibilityHandover"("areaId", "personName");

-- AddForeignKey
ALTER TABLE "ResponsibilityHandover" ADD CONSTRAINT "ResponsibilityHandover_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "ResponsibilityArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

