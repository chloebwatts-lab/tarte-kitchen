-- CreateEnum
CREATE TYPE "ServiceVisitKind" AS ENUM ('COMPLETED', 'BOOKED');

-- CreateEnum
CREATE TYPE "ServiceVisitSource" AS ENUM ('EMAIL', 'MANUAL');

-- CreateTable
CREATE TABLE "ServiceProgram" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT,
    "providerName" TEXT,
    "providerPhone" TEXT,
    "providerEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "intervalDays" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceVisit" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "kind" "ServiceVisitKind" NOT NULL,
    "serviceDate" DATE NOT NULL,
    "providerName" TEXT,
    "costCents" INTEGER,
    "source" "ServiceVisitSource" NOT NULL DEFAULT 'MANUAL',
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "gmailMessageId" TEXT,
    "emailSubject" TEXT,
    "recordedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceEmailSeen" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceEmailSeen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceProgram_venue_active_idx" ON "ServiceProgram"("venue", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceVisit_programId_gmailMessageId_key" ON "ServiceVisit"("programId", "gmailMessageId");

-- CreateIndex
CREATE INDEX "ServiceVisit_programId_serviceDate_idx" ON "ServiceVisit"("programId", "serviceDate");

-- CreateIndex
CREATE INDEX "ServiceVisit_needsReview_idx" ON "ServiceVisit"("needsReview");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceEmailSeen_gmailMessageId_key" ON "ServiceEmailSeen"("gmailMessageId");

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ServiceProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
