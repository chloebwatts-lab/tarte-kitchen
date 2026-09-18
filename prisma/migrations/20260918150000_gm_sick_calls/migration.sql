-- GM desk sick-call log. Additive only.
CREATE TABLE "GmSickCall" (
  "id" TEXT NOT NULL,
  "staffName" TEXT NOT NULL,
  "calledOn" DATE NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GmSickCall_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GmSickCall_calledOn_idx" ON "GmSickCall"("calledOn");
CREATE INDEX "GmSickCall_staffName_idx" ON "GmSickCall"("staffName");
