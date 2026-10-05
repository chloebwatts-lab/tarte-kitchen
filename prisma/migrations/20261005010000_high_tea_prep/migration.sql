-- Tea Garden high tea prep list: what goes on a stand, the day-before
-- "full high tea or not" check per booking, and the list as it stood at
-- 48, 24 and 12 hours out so each email can show what changed.
CREATE TABLE IF NOT EXISTS "HighTeaStandItem" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "perGuest" DECIMAL(6,3) NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HighTeaStandItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HighTeaStandItem_name_key" ON "HighTeaStandItem"("name");

CREATE TABLE IF NOT EXISTS "HighTeaBookingCheck" (
  "bookingRef" TEXT NOT NULL,
  "highTeaPax" INTEGER NOT NULL,
  "checkedBy" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HighTeaBookingCheck_pkey" PRIMARY KEY ("bookingRef")
);

CREATE TABLE IF NOT EXISTS "HighTeaPrepSnapshot" (
  "id" TEXT NOT NULL,
  "serviceDate" DATE NOT NULL,
  "stage" TEXT NOT NULL,
  "guests" INTEGER NOT NULL,
  "bookedGuests" INTEGER NOT NULL,
  "items" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HighTeaPrepSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HighTeaPrepSnapshot_serviceDate_stage_key" ON "HighTeaPrepSnapshot"("serviceDate", "stage");
