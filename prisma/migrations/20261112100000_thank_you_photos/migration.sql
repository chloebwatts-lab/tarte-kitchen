-- Staff photos for the FOH "Thank you :)" finishing page (Oliver, 12 Nov
-- 2026). Additive only.
CREATE TABLE "ThankYouPhoto" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL DEFAULT 'BURLEIGH',
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ThankYouPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ThankYouPhoto_venue_archived_idx" ON "ThankYouPhoto"("venue", "archived");
