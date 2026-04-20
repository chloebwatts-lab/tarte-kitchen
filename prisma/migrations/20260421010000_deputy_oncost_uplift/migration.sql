-- Add on-cost uplift rate (workers' comp + payroll tax) stacked on top
-- of super. Defaults to 0 so existing installs see no change until the
-- owner configures it in Settings → Integrations → Deputy.
ALTER TABLE "DeputyConnection"
  ADD COLUMN "onCostUpliftRate" DECIMAL(6,5) NOT NULL DEFAULT 0;
