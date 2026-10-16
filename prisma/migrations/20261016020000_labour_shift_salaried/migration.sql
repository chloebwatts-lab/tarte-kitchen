-- Tarte Shifts labour feed: salaried people's shift and timesheet rows are
-- flagged so the digest recode never prices their hours; their pay comes in
-- as daily salary roll-up rows placed where they worked (16 Oct 2026).

-- AlterTable
ALTER TABLE "LabourShift" ADD COLUMN     "salaried" BOOLEAN NOT NULL DEFAULT false;
