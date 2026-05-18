-- Google Business Profile API integration. The OAuth refresh token
-- lets the reviews cron call mybusiness.googleapis.com without further
-- user interaction. Single-tenant — only one connection at a time.
CREATE TABLE "GbpConnection" (
  "id"           TEXT NOT NULL,
  "accessToken"  TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "tokenExpiry"  TIMESTAMP(3) NOT NULL,
  "email"        TEXT NOT NULL,
  "accountName"  TEXT,
  "lastSyncAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GbpConnection_pkey" PRIMARY KEY ("id")
);

-- Bind each Tarte venue to its Business Profile location via the
-- shared Google Maps placeId. The fetcher prefers GBP over the Places
-- API when this column is populated (paginated, all reviews, vs the
-- 5-cap Places window).
ALTER TABLE "GoogleVenuePlace" ADD COLUMN "gbpLocationName" TEXT;
CREATE UNIQUE INDEX "GoogleVenuePlace_gbpLocationName_key"
  ON "GoogleVenuePlace"("gbpLocationName");
