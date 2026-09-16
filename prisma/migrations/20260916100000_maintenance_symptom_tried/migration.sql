-- The fix page records which symptom was picked and which quick fixes were
-- tried before the fault was logged, so the alert email and the morning
-- board can say what has already been checked.

-- AlterTable
ALTER TABLE "MaintenanceIssue" ADD COLUMN     "symptomKey" TEXT,
ADD COLUMN     "triedFixes" TEXT[] DEFAULT ARRAY[]::TEXT[];
