-- AlterTable
ALTER TABLE "PastryPrepTask" ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "PastryListNote" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "list" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PastryListNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeptItemPar" (
    "id" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "approvedItemId" TEXT NOT NULL,
    "par" DECIMAL(10,2) NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeptItemPar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PastryListNote_venue_list_key" ON "PastryListNote"("venue", "list");

-- CreateIndex
CREATE INDEX "DeptItemPar_approvedItemId_idx" ON "DeptItemPar"("approvedItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DeptItemPar_venue_approvedItemId_key" ON "DeptItemPar"("venue", "approvedItemId");

-- AddForeignKey
ALTER TABLE "DeptItemPar" ADD CONSTRAINT "DeptItemPar_approvedItemId_fkey" FOREIGN KEY ("approvedItemId") REFERENCES "ApprovedSupplierItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

