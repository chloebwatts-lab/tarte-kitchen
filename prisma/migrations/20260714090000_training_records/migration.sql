-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "staffName" TEXT NOT NULL,
    "role" TEXT,
    "onlineCourse" TEXT,
    "onlineCourseDate" DATE,
    "certificateSighted" BOOLEAN NOT NULL DEFAULT false,
    "allergenTrainedAt" DATE,
    "inductionAt" DATE,
    "illnessPolicyAt" DATE,
    "recordsTrainedAt" DATE,
    "verifiedBy" TEXT,
    "verifiedAt" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingRecord_venue_staffName_idx" ON "TrainingRecord"("venue", "staffName");
