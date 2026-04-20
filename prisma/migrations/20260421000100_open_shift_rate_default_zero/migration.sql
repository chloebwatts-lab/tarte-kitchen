-- Open shifts now default to $0/hr so the labour % matches Deputy's
-- Insights display out of the box. Existing connections that were
-- configured at the old $30 default are reset to 0 — users can re-set
-- to any non-zero value in Settings → Integrations if they want
-- commitment estimates for unfilled hours.
ALTER TABLE "DeputyConnection"
  ALTER COLUMN "defaultOpenShiftRate" SET DEFAULT 0;

UPDATE "DeputyConnection"
SET "defaultOpenShiftRate" = 0
WHERE "defaultOpenShiftRate" = 30;
