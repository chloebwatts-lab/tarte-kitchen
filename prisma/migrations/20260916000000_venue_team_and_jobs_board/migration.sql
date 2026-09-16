-- Jobs board + manager's plate.
--
-- VenueTask learns who assigned it and when, whether an owner handed it
-- back, and a rough size in minutes. VenueTeamMember names the manager and
-- supervisors at a venue so the boards can lay themselves out around real
-- people before any history exists. Burleigh is seeded from Chloe's brief
-- of 16 Sep 2026: Georgia runs the morning board; Sav, Lacey and Jazz are
-- the supervisors jobs get put on. "Sav" is the spelling already in use on
-- the board, so it is kept rather than corrected.

-- AlterTable
ALTER TABLE "VenueTask" ADD COLUMN     "assignedBy" TEXT,
ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "handedBackBy" TEXT,
ADD COLUMN     "handedBackAt" TIMESTAMP(3),
ADD COLUMN     "estimateMinutes" INTEGER,
ADD COLUMN     "personal" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "VenueTeamRole" AS ENUM ('MANAGER', 'SUPERVISOR');

-- CreateTable
CREATE TABLE "VenueTeamMember" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "name" TEXT NOT NULL,
    "role" "VenueTeamRole" NOT NULL DEFAULT 'SUPERVISOR',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VenueTeamMember_venue_isActive_sortOrder_idx" ON "VenueTeamMember"("venue", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VenueTeamMember_venue_name_key" ON "VenueTeamMember"("venue", "name");

-- Seed Burleigh. ON CONFLICT so it is safe to re-apply and never overrides
-- a name that was later changed from the app.
INSERT INTO "VenueTeamMember" ("id","venue","name","role","sortOrder","updatedAt")
VALUES
  (gen_random_uuid()::text,'BURLEIGH','Georgia','MANAGER',0,now()),
  (gen_random_uuid()::text,'BURLEIGH','Sav','SUPERVISOR',1,now()),
  (gen_random_uuid()::text,'BURLEIGH','Lacey','SUPERVISOR',2,now()),
  (gen_random_uuid()::text,'BURLEIGH','Jazz','SUPERVISOR',3,now())
ON CONFLICT ("venue","name") DO NOTHING;

-- The one job already on the board with an owner was put there by Chloe on
-- 15 Sep; give it an assignedAt so the Jobs board does not show it as
-- undated. assignedBy is left null because it was not recorded.
UPDATE "VenueTask" SET "assignedAt" = "updatedAt"
WHERE "ownedBy" IS NOT NULL AND "assignedAt" IS NULL AND "status" IN ('OPEN','IN_PROGRESS');
