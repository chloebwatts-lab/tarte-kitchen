-- CreateEnum
CREATE TYPE "MaintenanceAssetStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "MaintenanceIssueStatus" AS ENUM ('OPEN', 'FIXED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "MaintenanceContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceAsset" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "location" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT NOT NULL DEFAULT 'other',
    "status" "MaintenanceAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "manufacturer" TEXT,
    "model" TEXT,
    "serial" TEXT,
    "year" TEXT,
    "photoUrl" TEXT,
    "photoPublicId" TEXT,
    "purchaseDate" DATE,
    "purchasePriceCents" INTEGER,
    "supplier" TEXT,
    "warrantyMonths" INTEGER,
    "warrantyProvider" TEXT,
    "warrantyNotes" TEXT,
    "notes" TEXT,
    "mxId" TEXT,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceIssue" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "venue" "Venue" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "MaintenanceIssueStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "MaintenancePriority",
    "isSafety" BOOLEAN NOT NULL DEFAULT false,
    "reportedBy" TEXT,
    "contactId" TEXT,
    "fixSummary" TEXT,
    "fixedBy" TEXT,
    "fixedAt" TIMESTAMP(3),
    "costCents" INTEGER,
    "wasWarranty" BOOLEAN NOT NULL DEFAULT false,
    "legacyRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceIssueEvent" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceIssueEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceAsset_slug_key" ON "MaintenanceAsset"("slug");

-- CreateIndex
CREATE INDEX "MaintenanceAsset_venue_status_idx" ON "MaintenanceAsset"("venue", "status");

-- CreateIndex
CREATE INDEX "MaintenanceIssue_assetId_status_idx" ON "MaintenanceIssue"("assetId", "status");

-- CreateIndex
CREATE INDEX "MaintenanceIssue_venue_status_idx" ON "MaintenanceIssue"("venue", "status");

-- CreateIndex
CREATE INDEX "MaintenanceIssueEvent_issueId_idx" ON "MaintenanceIssueEvent"("issueId");

-- AddForeignKey
ALTER TABLE "MaintenanceIssue" ADD CONSTRAINT "MaintenanceIssue_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MaintenanceAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceIssue" ADD CONSTRAINT "MaintenanceIssue_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MaintenanceContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceIssueEvent" ADD CONSTRAINT "MaintenanceIssueEvent_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "MaintenanceIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

