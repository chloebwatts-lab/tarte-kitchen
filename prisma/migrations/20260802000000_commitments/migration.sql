-- CreateEnum
CREATE TYPE "CommitmentParty" AS ENUM ('JOSE', 'CHLOE', 'CANDY');

-- CreateTable
CREATE TABLE "StandingCommitment" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "autoSource" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandingCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandingCommitmentMark" (
    "id" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "met" BOOLEAN NOT NULL,
    "note" TEXT,
    "markedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandingCommitmentMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneOffCommitment" (
    "id" TEXT NOT NULL,
    "promise" TEXT NOT NULL,
    "saidBy" "CommitmentParty" NOT NULL,
    "agreedOn" DATE NOT NULL,
    "dueOn" DATE NOT NULL,
    "doneOn" DATE,
    "newDueOn" DATE,
    "missedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneOffCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitmentWeekPhoto" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "caption" TEXT,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommitmentWeekPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StandingCommitment_slug_key" ON "StandingCommitment"("slug");

-- CreateIndex
CREATE INDEX "StandingCommitmentMark_weekStart_idx" ON "StandingCommitmentMark"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "StandingCommitmentMark_commitmentId_weekStart_key" ON "StandingCommitmentMark"("commitmentId", "weekStart");

-- CreateIndex
CREATE INDEX "OneOffCommitment_dueOn_idx" ON "OneOffCommitment"("dueOn");

-- CreateIndex
CREATE INDEX "CommitmentWeekPhoto_weekStart_idx" ON "CommitmentWeekPhoto"("weekStart");

-- AddForeignKey
ALTER TABLE "StandingCommitmentMark" ADD CONSTRAINT "StandingCommitmentMark_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "StandingCommitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
