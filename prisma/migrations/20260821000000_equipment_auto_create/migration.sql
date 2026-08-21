-- Equipment auto-creation: assets can now be born from purchase emails
-- (check-equipment-emails sweep) or the staff quick-add page, not just
-- migration scripts. Email-created rows carry needsReview until confirmed.
ALTER TABLE "MaintenanceAsset" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "MaintenanceAsset" ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MaintenanceAsset" ADD COLUMN "gmailMessageId" TEXT;
ALTER TABLE "MaintenanceAsset" ADD COLUMN "sourceEmailSubject" TEXT;
ALTER TABLE "MaintenanceAsset" ADD COLUMN "addedBy" TEXT;

-- Every-message-once guard for the equipment sweep, mirrors ServiceEmailSeen.
CREATE TABLE "EquipmentEmailSeen" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentEmailSeen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EquipmentEmailSeen_gmailMessageId_key" ON "EquipmentEmailSeen"("gmailMessageId");
