-- VenueCogsTarget: live COGS % target per venue for the spend tracker.
CREATE TABLE "VenueCogsTarget" (
    "venue" "Venue" NOT NULL,
    "targetPct" DECIMAL(5,2) NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueCogsTarget_pkey" PRIMARY KEY ("venue")
);

INSERT INTO "VenueCogsTarget" ("venue", "targetPct", "updatedAt") VALUES
    ('BURLEIGH',     27.00, CURRENT_TIMESTAMP),
    ('BEACH_HOUSE',  28.00, CURRENT_TIMESTAMP),
    ('TEA_GARDEN',   28.00, CURRENT_TIMESTAMP);
