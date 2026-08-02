-- CreateTable
CREATE TABLE "MeetingAction" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "agreedOn" DATE NOT NULL,
    "dueOn" DATE NOT NULL,
    "doneOn" DATE,
    "sourceTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingAction_dueOn_idx" ON "MeetingAction"("dueOn");

-- CreateIndex
CREATE INDEX "MeetingAction_sourceTag_idx" ON "MeetingAction"("sourceTag");
