-- Track whether a Deputy roster shift is "Open" (unfilled, no employee
-- assigned). We cost these separately from assigned shifts — Deputy's
-- Insights page excludes them from wage totals, but users may want a
-- commitment estimate for forecasting. Applied at display time so the
-- open-shift rate is tunable in Settings without re-syncing Deputy.
ALTER TABLE "LabourShift"
  ADD COLUMN "isOpen" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing rows by inferring from the auto-generated name we
-- fall back to when no employee is in the roster (see syncDeputyRoster).
UPDATE "LabourShift"
SET "isOpen" = true
WHERE "employeeName" LIKE 'Employee #%';
