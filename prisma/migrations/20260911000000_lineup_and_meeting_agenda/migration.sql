-- CreateEnum
CREATE TYPE "MeetingItemStatus" AS ENUM ('OPEN', 'DISCUSSED', 'DROPPED');

-- CreateTable
CREATE TABLE "LineUp" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "date" DATE NOT NULL,
    "pushItem" TEXT,
    "eightySixed" TEXT,
    "notes" TEXT,
    "ledBy" TEXT,
    "ranAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAgendaItem" (
    "id" TEXT NOT NULL,
    "meetingDate" DATE,
    "venue" "Venue",
    "topic" TEXT NOT NULL,
    "detail" TEXT,
    "raisedBy" TEXT,
    "status" "MeetingItemStatus" NOT NULL DEFAULT 'OPEN',
    "discussedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingAgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LineUp_venue_date_idx" ON "LineUp"("venue", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LineUp_venue_date_key" ON "LineUp"("venue", "date");

-- CreateIndex
CREATE INDEX "MeetingAgendaItem_status_meetingDate_idx" ON "MeetingAgendaItem"("status", "meetingDate");

-- CreateIndex
CREATE INDEX "MeetingAgendaItem_createdAt_idx" ON "MeetingAgendaItem"("createdAt");

