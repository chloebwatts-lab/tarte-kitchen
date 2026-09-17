-- GM desk (Oliver's tile). Additive only.
CREATE TABLE "GmMark" (
  "id" TEXT NOT NULL,
  "itemSlug" TEXT NOT NULL,
  "weekStart" DATE NOT NULL,
  "met" BOOLEAN NOT NULL,
  "note" TEXT,
  "num1" INTEGER,
  "num2" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GmMark_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GmMark_itemSlug_weekStart_key" ON "GmMark"("itemSlug", "weekStart");
CREATE INDEX "GmMark_weekStart_idx" ON "GmMark"("weekStart");

CREATE TABLE "GmTask" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "doneMeans" TEXT NOT NULL,
  "dueOn" DATE NOT NULL,
  "doneOn" DATE,
  "note" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GmTask_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GmTask_slug_key" ON "GmTask"("slug");
CREATE INDEX "GmTask_dueOn_idx" ON "GmTask"("dueOn");

CREATE TABLE "GmOneOnOne" (
  "id" TEXT NOT NULL,
  "staffName" TEXT NOT NULL,
  "heldOn" DATE NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GmOneOnOne_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GmOneOnOne_heldOn_idx" ON "GmOneOnOne"("heldOn");
CREATE INDEX "GmOneOnOne_staffName_idx" ON "GmOneOnOne"("staffName");

CREATE TABLE "GmReport" (
  "id" TEXT NOT NULL,
  "weekStart" DATE NOT NULL,
  "fixed" TEXT NOT NULL,
  "need" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GmReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GmReport_weekStart_key" ON "GmReport"("weekStart");

CREATE TABLE "GmMonthly" (
  "id" TEXT NOT NULL,
  "month" DATE NOT NULL,
  "slug" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GmMonthly_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GmMonthly_month_slug_key" ON "GmMonthly"("month", "slug");
