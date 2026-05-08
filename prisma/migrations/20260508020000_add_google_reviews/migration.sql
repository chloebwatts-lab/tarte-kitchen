-- CreateEnum
CREATE TYPE "ReviewSentiment" AS ENUM (
  'POSITIVE',
  'NEGATIVE',
  'MIXED',
  'NEUTRAL'
);

-- CreateEnum
CREATE TYPE "ReviewTheme" AS ENUM (
  'FOOD_QUALITY',
  'COFFEE',
  'PASTRY',
  'SERVICE',
  'SPEED',
  'AMBIENCE',
  'VALUE',
  'CLEANLINESS',
  'STAFF_PRAISE',
  'STAFF_COMPLAINT',
  'WAIT_TIME',
  'ALLERGEN',
  'KIDS',
  'DIETARY',
  'RESERVATION',
  'OTHER'
);

-- CreateTable
CREATE TABLE "GoogleVenuePlace" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "placeId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "formattedAddress" TEXT NOT NULL,
    "rating" DECIMAL(3,2),
    "ratingCount" INTEGER,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleVenuePlace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleVenuePlace_venue_key" ON "GoogleVenuePlace"("venue");
CREATE UNIQUE INDEX "GoogleVenuePlace_placeId_key" ON "GoogleVenuePlace"("placeId");

-- CreateTable
CREATE TABLE "GoogleRatingSnapshot" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "rating" DECIMAL(3,2),
    "ratingCount" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleRatingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoogleRatingSnapshot_venue_fetchedAt_idx" ON "GoogleRatingSnapshot"("venue", "fetchedAt");

-- CreateTable
CREATE TABLE "GoogleReview" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "googleReviewId" TEXT NOT NULL,
    "authorName" TEXT,
    "authorUri" TEXT,
    "authorPhotoUri" TEXT,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "originalText" TEXT,
    "languageCode" TEXT,
    "publishTime" TIMESTAMP(3) NOT NULL,
    "relativePublishTime" TEXT,
    "replyText" TEXT,
    "replyTime" TIMESTAMP(3),
    "sentiment" "ReviewSentiment",
    "themes" "ReviewTheme"[] DEFAULT ARRAY[]::"ReviewTheme"[],
    "staffMentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "taggedSummary" TEXT,
    "taggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleReview_googleReviewId_key" ON "GoogleReview"("googleReviewId");
CREATE INDEX "GoogleReview_venue_publishTime_idx" ON "GoogleReview"("venue", "publishTime");
CREATE INDEX "GoogleReview_venue_rating_idx" ON "GoogleReview"("venue", "rating");
CREATE INDEX "GoogleReview_venue_sentiment_idx" ON "GoogleReview"("venue", "sentiment");

-- CreateTable
CREATE TABLE "GoogleReviewWeeklySummary" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "reviewCount" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "emailedTo" TEXT,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleReviewWeeklySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleReviewWeeklySummary_weekStart_key" ON "GoogleReviewWeeklySummary"("weekStart");

-- AddForeignKey
ALTER TABLE "GoogleRatingSnapshot" ADD CONSTRAINT "GoogleRatingSnapshot_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "GoogleVenuePlace"("placeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleReview" ADD CONSTRAINT "GoogleReview_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "GoogleVenuePlace"("placeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the 3 venue places
INSERT INTO "GoogleVenuePlace" ("id", "venue", "placeId", "displayName", "formattedAddress", "createdAt", "updatedAt")
VALUES
  ('seed_burleigh', 'BURLEIGH', 'ChIJAbYJBO8DkWsRZ5m-ig7obYg', 'Tarte Bakery & Cafe', '1748 Gold Coast Hwy, Burleigh Heads QLD 4220, Australia', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_beach_house', 'BEACH_HOUSE', 'ChIJuYHYFzEDkWsRje1pQyA0F-U', 'Tarte Beach House', 'Shop 1 2/4 Thrower Dr, Currumbin QLD 4223, Australia', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_tea_garden', 'TEA_GARDEN', 'ChIJX5GpejcDkWsR_z5Ncuq4sVc', 'Tarte Tea Garden', '2 Thrower Dr, Currumbin QLD 4223, Australia', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
