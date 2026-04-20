-- Deputy's Insights Summary bakes superannuation into its wage totals,
-- but the Roster/Timesheet API's Cost field does not. Store a per-connection
-- on-cost multiplier so the labour tab matches Deputy's display.
--
-- Open (unfilled) roster slots have no employee and thus no payrate in
-- Deputy's API — we cost them at a configured default so the labour %
-- still reflects the commitment the schedule represents.

ALTER TABLE "DeputyConnection"
  ADD COLUMN "superRate"             DECIMAL(5,4) NOT NULL DEFAULT 0.12,
  ADD COLUMN "defaultOpenShiftRate"  DECIMAL(8,2) NOT NULL DEFAULT 30.00;
