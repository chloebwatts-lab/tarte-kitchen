-- CreateEnum
CREATE TYPE "CouncilDocumentType" AS ENUM (
  'FOOD_BUSINESS_LICENCE',
  'FSS_CERTIFICATE',
  'FSS_NOTIFICATION',
  'PEST_CONTROL_REPORT',
  'FLOOR_PLAN',
  'TRAINING_RECORD',
  'CALIBRATION_RECORD',
  'CLEANING_SCHEDULE',
  'ALLERGEN_TRAINING',
  'HACCP_PLAN',
  'RECALL_PROCEDURE',
  'GREASE_TRAP_RECORD',
  'EAT_SAFE_RATING',
  'SUPPLIER_APPROVAL',
  'INCIDENT_LOG',
  'OTHER'
);

-- CreateTable
CREATE TABLE "CouncilDocument" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "type" "CouncilDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "issuedOn" DATE,
    "expiresOn" DATE,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouncilDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CouncilDocument_venue_type_idx" ON "CouncilDocument"("venue", "type");

-- CreateIndex
CREATE INDEX "CouncilDocument_venue_expiresOn_idx" ON "CouncilDocument"("venue", "expiresOn");
